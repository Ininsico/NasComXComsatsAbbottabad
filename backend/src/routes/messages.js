import { Router } from 'express';
import { record as audit } from '../lib/audit.js';
import { requireAuth } from '../lib/auth.js';
import { optOutBlocked, findContact } from '../lib/contacts.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import { addActivity, findLead } from '../lib/leads.js';
import { listMessages, recordOutbound } from '../lib/conversations.js';
import { sendWhatsAppMessage } from '../lib/whatsapp.js';

const router = Router();

router.use(requireAuth, workspaceContext);

/**
 * The conversation view: every recorded WhatsApp message for a contact or a lead, newest
 * first. Reading is a CRM permission; sending is an edit permission, because a message out
 * the door is a change the customer can see.
 */
router.get('/', requirePermission('crm.view'), async (req, res) => {
  const messages = await listMessages(req.workspace.id, {
    contactId: req.query.contactId ?? null,
    leadId: req.query.leadId ?? null,
    limit: req.query.limit,
  });

  res.json({ messages });
});

/**
 * Send a WhatsApp message to a contact through that workspace's linked number.
 *
 * The gate is a person's own word: someone who replying "stop" has opted out, and this
 * endpoint refuses with the reason instead of asking them to reconsider. A redelivery of
 * the same provider message cannot double-record, and both the ledger entry and the lead's
 * activity trail are written here.
 */
router.post('/send', requirePermission('crm.edit'), async (req, res) => {
  const workspaceId = req.workspace.id;
  const body = String(req.body?.body ?? req.body?.text ?? '').trim();
  const contactId = String(req.body?.contactId ?? '');
  const leadId = String(req.body?.leadId ?? '');

  if (!body) return res.status(400).json({ error: 'Write a message to send' });

  let contact = null;

  if (contactId) {
    contact = await findContact(contactId, workspaceId);

    if (!contact) return res.status(404).json({ error: 'No such contact' });
  }

  let targetNumber = null;

  if (contact?.phone) {
    targetNumber = contact.phone;
  } else {
    return res.status(400).json({ error: 'The contact has no phone number to reach' });
  }

  if (optOutBlocked(contact)) {
    return res.status(409).json({
      error: `This contact opted out on ${contact.optOut.at ? new Date(contact.optOut.at).toLocaleDateString() : 'an unknown date'}${
        contact.optOut.reason ? ` — ${contact.optOut.reason}` : ''
      }. They cannot be messaged.`,
      optOut: contact.optOut,
    });
  }

  let sent;

  try {
    sent = await sendWhatsAppMessage(workspaceId, targetNumber, body.slice(0, 4000));
  } catch (error) {
    return res.status(502).json({ error: `Could not send: ${error.message}` });
  }

  await recordOutbound({
    workspaceId,
    contactId: contact?.id ?? contactId,
    leadId: leadId || null,
    body,
    providerMessageId: sent.id,
    status: 'sent',
  });

  if (leadId) {
    const lead = await findLead(leadId, workspaceId);

    if (lead && lead.contactId === contact?.id) {
      await addActivity({
        workspaceId,
        leadId,
        kind: 'whatsapp',
        summary: `Outbound WhatsApp: ${body.slice(0, 140)}`,
        by: req.user.name,
      });
    }
  }

  await audit({
    workspaceId,
    actorId: req.user.id,
    action: 'message.sent',
    target: contact?.id ?? null,
    metadata: { providerMessageId: sent.id, leadId: leadId || null },
  });

  return res.status(201).json({ sent: { id: sent.id, to: sent.to, status: 'sent' } });
});

export default router;
