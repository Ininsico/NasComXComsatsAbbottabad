import { db } from './db.js';
import { getSettings } from './settings.js';
import { createContact, findContactForIdentity, listContacts } from './contacts.js';
import { createLead } from './leads.js';

/**
 * The message ledger, and the bridge between WhatsApp and the CRM.
 *
 * Every inbound message is de-duplicated by its provider id — WhatsApp can re-deliver, and
 * nothing here may turn a redelivery into a second contact, lead or activity entry. Every
 * outbound message records what happened, so a retry is a decision someone makes with the
 * status in front of them, not a silent resend.
 *
 * An inbound message on the deployment's own number belongs to whichever workspace accepts
 * public intake (the one a website form would have landed in). An inbound message on a
 * workspace's linked number belongs to that workspace, full stop.
 */
const conversations = db.collection('messages');

const text = (value, limit = 4000) => String(value ?? '').trim().slice(0, limit);

/** Whichever workspace accepts public leads, so a website form and a text agree. */
async function intakeWorkspaceId() {
  const workspaces = await db.collection('workspaces').where(() => true);

  for (const workspace of workspaces) {
    const settings = await getSettings(workspace.id);

    if (settings.publicIntake) return workspace.id;
  }

  return workspaces[0]?.id ?? null;
}

/** Already recorded? WhatsApp re-delivers; the ledger must not. */
export async function findMessageByProviderId(providerMessageId) {
  if (!providerMessageId) return null;

  return conversations.find((row) => row.providerMessageId === providerMessageId);
}

export async function listMessages(workspaceId, { contactId, leadId, limit = 50 } = {}) {
  return (await conversations.where((row) => row.workspaceId === workspaceId))
    .filter((row) => (!contactId || row.contactId === contactId) && (!leadId || row.leadId === leadId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.min(Number(limit) || 50, 500));
}

/**
 * Record one inbound message, and route it into the CRM: an unknown number becomes a
 * contact and a lead from source whatsapp, a known one is attached to their existing
 * records, and the lead's activity trail gets the message.
 *
 * Returns { workspaceId, contact, lead, message } or null when the sender's number is not
 * a phone number (groups, status broadcasts, LIDs the library could not resolve).
 */
export async function recordInbound({ workspaceId: scope, body, from, providerMessageId, hasName }) {
  const digits = String(from ?? '').replace(/\D/g, '');

  if (digits.length < 7) return null;

  const workspaceId = scope === 'main' ? await intakeWorkspaceId() : scope;

  if (!workspaceId) return null;

  if (providerMessageId && (await findMessageByProviderId(providerMessageId))) {
    return { duplicate: true, workspaceId };
  }

  let contact = await findContactForIdentity(workspaceId, { phone: from });

  if (!contact) {
    const created = await createContact({
      workspaceId,
      input: {
        name: hasName || `WhatsApp ${digits.slice(-10)}`,
        phone: digits.length >= 10 ? `+${digits}` : digits,
      },
    });

    contact = created?.contact ?? null;
  }

  if (!contact) return null;

  // Their most open lead is where the message belongs; without one, a lead is created so
  // the message has a record to live on.
  const leads = (await db.collection('leads').where((row) => row.workspaceId === workspaceId)).filter(
    (lead) => lead.contactId === contact.id,
  );

  const open = leads.find((lead) => !['won', 'lost'].includes(lead.stage)) ?? leads[0];
  let leadId = open?.id ?? null;
  let leadCreated = false;

  if (!leadId) {
    const result = await createLead({
      workspaceId,
      input: {
        name: contact.name,
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        source: 'whatsapp',
        notes: `Inbound on WhatsApp from ${digits.slice(-10)}`,
      },
      actorName: 'whatsapp',
    });

    leadId = result.lead.id;
    leadCreated = true;
  }

  const message = await conversations.insert({
    workspaceId,
    contactId: contact.id,
    leadId,
    direction: 'inbound',
    provider: 'whatsapp',
    providerMessageId: providerMessageId ?? null,
    body: text(body),
    status: 'received',
    at: new Date().toISOString(),
  });

  return { workspaceId, contact, leadId, leadCreated, message };
}

/** Record an outbound send, deduped the same way the inbound ledger is. */
export async function recordOutbound({ workspaceId, contactId, leadId, body, providerMessageId, status = 'sent' }) {
  if (providerMessageId && (await findMessageByProviderId(providerMessageId))) {
    return { duplicate: true };
  }

  return {
    message: await conversations.insert({
      workspaceId,
      contactId: contactId ?? null,
      leadId: leadId ?? null,
      direction: 'outbound',
      provider: 'whatsapp',
      providerMessageId: providerMessageId ?? null,
      body: text(body),
      status,
      at: new Date().toISOString(),
    }),
  };
}

/** A delivery acknowledgement from the WhatsApp client updates the ledger, not the body. */
export async function markMessageStatus(providerMessageId, status) {
  if (!providerMessageId) return null;

  return conversations.mutate((rows) => {
    const row = rows.find((entry) => entry.providerMessageId === providerMessageId);

    if (!row) return null;

    row.status = status;
    row.acknowledgedAt = new Date().toISOString();

    return row;
  });
}

/** The opt-out tell-tales: exactly these words, alone. */
const STOP_PATTERN = /^(stop|unsubscribe|opt\s?out)\s*$/i;
const START_PATTERN = /^(start|resume)\s*$/i;

export function isOptOutRequest(body) {
  return STOP_PATTERN.test(String(body ?? '').trim());
}

export function isOptInRequest(body) {
  return START_PATTERN.test(String(body ?? '').trim());
}
