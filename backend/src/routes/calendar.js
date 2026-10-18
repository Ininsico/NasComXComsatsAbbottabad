import { Router } from 'express';
import { record as audit } from '../lib/audit.js';
import {
  findAppointment,
  listAppointments,
  markCancelled,
  recordAppointment,
} from '../lib/appointments.js';
import { requireAuth } from '../lib/auth.js';
import {
  authorizationUrl,
  bookAppointment,
  busyIntervals,
  connectionFor,
  deleteEvent,
  disconnect,
  exchangeCode,
  googleConfigured,
  redirectUri,
  saveTokens,
} from '../lib/calendar.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import { db } from '../lib/db.js';
import { addActivity, findLead } from '../lib/leads.js';
import { getSettings } from '../lib/settings.js';

const router = Router();

function publicOrigin() {
  return (process.env.PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
}

/**
 * Google redirects the browser here, so there is no bearer token: the workspace is
 * carried in `state`, and the code is exchanged server-side so the client secret never
 * reaches the browser.
 */
router.get('/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  const workspaceId = state.split('.')[0];

  if (!code || !workspaceId) {
    return res.redirect(`${publicOrigin()}/integrations?calendar=error&reason=missing-code`);
  }

  const workspace = await db.collection('workspaces').find((row) => row.id === workspaceId);

  if (!workspace) {
    return res.redirect(`${publicOrigin()}/integrations?calendar=error&reason=unknown-workspace`);
  }

  try {
    const tokens = await exchangeCode(code);

    await saveTokens(workspaceId, tokens);

    await audit({ workspaceId, actorId: null, action: 'integration.google.connected', target: 'google' });

    return res.redirect(`${publicOrigin()}/integrations?calendar=connected`);
  } catch (error) {
    await audit({
      workspaceId,
      actorId: null,
      action: 'integration.google.failed',
      target: 'google',
      metadata: { error: String(error.message).slice(0, 200) },
    });

    return res.redirect(`${publicOrigin()}/integrations?calendar=error&reason=exchange-failed`);
  }
});

router.use(requireAuth, workspaceContext);

router.get('/status', requirePermission('crm.view'), async (req, res) => {
  const connection = await connectionFor(req.workspace.id);

  res.json({
    configured: googleConfigured(),
    redirectUri: redirectUri(),
    connected: Boolean(connection),
    account: connection?.account ?? null,
    connectedAt: connection?.connectedAt ?? null,
    lastSyncAt: connection?.lastSyncAt ?? null,
    history: connection?.history ?? [],
  });
});

router.get('/authorize', requirePermission('integrations.manage'), async (req, res) => {
  const authorization = authorizationUrl(req.workspace.id);

  if (!authorization) {
    return res.status(503).json({
      error: 'Google Calendar is not configured on this server (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)',
    });
  }

  return res.json({ url: authorization.url });
});

router.delete('/connection', requirePermission('integrations.manage'), async (req, res) => {
  await disconnect(req.workspace.id);

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'integration.google.disconnected',
    target: 'google',
  });

  return res.json({ ok: true });
});

router.get('/busy', requirePermission('crm.view'), async (req, res) => {
  const startIso = String(req.query.start ?? '');
  const endIso = String(req.query.end ?? '');
  const settings = await getSettings(req.workspace.id);

  if (Number.isNaN(Date.parse(startIso)) || Number.isNaN(Date.parse(endIso))) {
    return res.status(400).json({ error: 'Pass start and end as ISO dates' });
  }

  try {
    return res.json({ busy: await busyIntervals(req.workspace.id, startIso, endIso, settings.timezone) });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

/** Book an appointment for a lead. Refuses to double-book, and records the booking. */
router.post('/book', requirePermission('crm.edit'), async (req, res) => {
  const lead = await findLead(String(req.body?.leadId ?? ''), req.workspace.id);

  if (!lead) return res.status(404).json({ error: 'No such lead' });

  const startIso = String(req.body?.start ?? '');
  const endIso = String(req.body?.end ?? '');

  if (Number.isNaN(Date.parse(startIso)) || Number.isNaN(Date.parse(endIso))) {
    return res.status(400).json({ error: 'Pass start and end as ISO dates' });
  }

  if (Date.parse(endIso) <= Date.parse(startIso)) {
    return res.status(400).json({ error: 'The end must be after the start' });
  }

  const settings = await getSettings(req.workspace.id);

  try {
    const result = await bookAppointment({
      workspaceId: req.workspace.id,
      summary: req.body?.summary || `Appointment: ${lead.name}`,
      description: req.body?.description || `Booked from the CRM for ${lead.email || lead.phone || lead.name}`,
      startIso,
      endIso,
      timeZone: req.body?.timeZone || settings.timezone,
      attendee: lead.email || undefined,
    });

    if (result.conflict) {
      return res.status(409).json({ error: 'That slot is already busy', busy: result.busy });
    }

    await addActivity({
      workspaceId: req.workspace.id,
      leadId: lead.id,
      kind: 'meeting',
      summary: `Appointment booked for ${new Date(startIso).toLocaleString()} (${settings.timezone})`,
      by: req.user.name,
    });

    const appointment = await recordAppointment({
      workspaceId: req.workspace.id,
      leadId: lead.id,
      contactId: lead.contactId ?? null,
      memberId: req.member.id,
      memberName: req.user.name,
      title: req.body?.summary || `Appointment: ${lead.name}`,
      start: startIso,
      end: endIso,
      timeZone: req.body?.timeZone || settings.timezone,
      googleEventId: result.event.id,
    });

    await audit({
      workspaceId: req.workspace.id,
      actorId: req.user.id,
      action: 'calendar.event_created',
      target: lead.id,
      metadata: { eventId: result.event.id, start: startIso },
    });

    return res.status(201).json({
      event: { id: result.event.id, htmlLink: result.event.htmlLink },
      appointment,
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

/** Every booking this workspace has made, soonest first. */
router.get('/appointments', requirePermission('crm.view'), async (req, res) => {
  res.json({ appointments: await listAppointments(req.workspace.id) });
});

/**
 * Cancel an appointment: the Google event goes first, then the local row. If Google refuses
 * for a real reason the cancellation is not recorded, because a calendar that still holds
 * the meeting should not be reported as cancelled.
 */
router.delete('/appointments/:id', requirePermission('crm.edit'), async (req, res) => {
  const appointment = await findAppointment(req.params.id, req.workspace.id);

  if (!appointment) return res.status(404).json({ error: 'No such appointment' });
  if (appointment.status === 'cancelled') return res.status(409).json({ error: 'Already cancelled' });

  if (appointment.googleEventId) {
    try {
      await deleteEvent(req.workspace.id, appointment.googleEventId);
    } catch (error) {
      return res.status(502).json({
        error: `The calendar refused the cancellation: ${error.message}`,
      });
    }
  }

  const cancelled = await markCancelled({ workspaceId: req.workspace.id, id: appointment.id });

  if (appointment.leadId) {
    await addActivity({
      workspaceId: req.workspace.id,
      leadId: appointment.leadId,
      kind: 'meeting',
      summary: `Appointment cancelled (was ${new Date(appointment.start).toLocaleString()})`,
      by: req.user.name,
    });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'calendar.event_cancelled',
    target: appointment.leadId ?? appointment.id,
    metadata: { eventId: appointment.googleEventId, start: appointment.start },
  });

  return res.json({ appointment: cancelled });
});

export default router;
