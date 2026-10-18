import { config } from '../config.js';
import pipeline, { CHAT_GENERATION } from './knowledge.js';
import { addActivity } from './leads.js';
import { findProfileByPhone } from './profiles.js';
import { findUserById } from './store.js';
import { isOptInRequest, isOptOutRequest, recordInbound } from './conversations.js';
import { optInContact, optOutContact } from './contacts.js';

const digits = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * The real phone number behind a chat id.
 *
 * Modern WhatsApp often addresses chats by LID (`<long-number>@lid`) rather than
 * a phone number, and profile matching against a LID silently fails — the sender
 * would then get their own anonymous namespace instead of their own records. When
 * the id is a LID we ask the library for the underlying contact number.
 */
async function resolveSenderNumber(message, from) {
  const raw = digits(from.split('@')[0]);

  if (!from.endsWith('@lid')) return raw;

  try {
    const contact = await message.getContact();
    const phone = digits(contact?.number ?? '');
    return phone.length >= 7 ? phone : raw;
  } catch {
    return raw;
  }
}

/**
 * Turns an incoming WhatsApp message into a reply.
 *
 * The sender's number is matched to a member profile so the answer is grounded in that
 * member's own vector space plus the shared product-help one. Unrecognised numbers still
 * get an isolated namespace, so they can ask product questions without ever seeing another
 * member's documents.
 *
 * Latency matters here, so nothing on the critical path touches the browser unless it has
 * to: group detection reads the chat id, and the typing indicator is fired without being
 * awaited.
 */
export function createWhatsAppHandler() {
  return async function handleIncoming(message, scope = 'main') {
    if (!message || message.fromMe) return null;

    const from = String(message.from ?? '');
    if (from.includes('status@broadcast')) return null;

    // Group ids end in @g.us, so this needs no round trip.
    if (from.endsWith('@g.us') && !config.whatsapp.replyToGroups) return null;

    const body = String(message.body ?? '').trim();
    if (body.length === 0) return null;

    // Fire and forget: costs nothing on the critical path, but the sender sees
    // "typing…" immediately instead of a dead line.
    void message
      .getChat()
      .then((chat) => chat?.sendStateTyping?.())
      .catch(() => {});

    const senderNumber = await resolveSenderNumber(message, from);

    // The CRM record comes first: the provider id makes redeliveries idempotent, an unknown
    // number becomes a contact and a lead, and an opt-out request is honoured and then
    // ends the conversation — the assistant must not argue with it.
    const recorded = await recordInbound({
      scope,
      body,
      from: senderNumber,
      providerMessageId: message.id?._serialized ?? null,
      hasName: message._data?.notifyName ?? null,
    }).catch((error) => {
      console.error(`[whatsapp:${scope}][crm] recording failed: ${error.message}`);
      return null;
    });

    if (recorded?.duplicate) return null;

    // They control their own phone. A stop removes them until they ask back in, so both
    // words are honoured as the sender's decision rather than a message to debate.
    if (isOptOutRequest(body) || isOptInRequest(body)) {
      if (recorded?.contact) {
        const optedOut = isOptOutRequest(body);

        await (optedOut
          ? optOutContact({
              workspaceId: recorded.workspaceId,
              id: recorded.contact.id,
              reason: 'the contact replied "stop"',
            })
          : optInContact({ workspaceId: recorded.workspaceId, id: recorded.contact.id }));

        return optedOut
          ? 'You have been removed from our messages. Reply "start" if you change your mind.'
          : 'Welcome back — you are on our list again.';
      }

      return null;
    }

    const profile = await findProfileByPhone(senderNumber);
    const user = profile ? await findUserById(profile.userId) : null;

    if (!user && !config.whatsapp.allowUnknown) return null;

    if (recorded?.leadId && recorded?.message?.id) {
      await addActivity({
        workspaceId: recorded.workspaceId,
        leadId: recorded.leadId,
        kind: 'whatsapp',
        summary: `Inbound WhatsApp: ${body.slice(0, 140)}`,
        by: 'WhatsApp',
      }).catch(() => {});
    }

    const userId = user?.id ?? `wa-${senderNumber}`;

    const result = await pipeline.answer({
      userId,
      question: body.slice(0, 500),
      // Three passages is plenty and keeps the prompt short, which is most of
      // the prefill time.
      topK: Math.min(config.rag.topK, 3),
      minScore: config.rag.minScore,
      generation: CHAT_GENERATION,
    });

    return result.answer;
  };
}
