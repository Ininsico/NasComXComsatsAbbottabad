import { config } from '../config.js';
import pipeline from './knowledge.js';
import { findProfileByPhone } from './profiles.js';
import { findUserById } from './store.js';

const digits = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Turns an incoming WhatsApp message into a reply.
 *
 * The sender's number is matched to a member profile so the answer is grounded
 * in that member's own vector space plus the shared campus one. Unrecognised
 * numbers still get an isolated namespace, so they can ask campus questions
 * without ever seeing another member's documents.
 */
export function createWhatsAppHandler() {
  return async function handleIncoming(message) {
    if (!message || message.fromMe) return null;
    if (String(message.from).includes('status@broadcast')) return null;

    const body = String(message.body ?? '').trim();
    if (body.length < 2) return null;

    let chat = null;

    try {
      chat = await message.getChat();
    } catch {
      chat = null;
    }

    if (chat?.isGroup && !config.whatsapp.replyToGroups) return null;

    const number = digits(String(message.from).split('@')[0]);
    const profile = await findProfileByPhone(number);
    const user = profile ? await findUserById(profile.userId) : null;

    if (!user && !config.whatsapp.allowUnknown) return null;

    const userId = user?.id ?? `wa-${number}`;

    const result = await pipeline.answer({
      userId,
      question: body.slice(0, 600),
      topK: config.rag.topK,
      minScore: config.rag.minScore,
    });

    return result.answer;
  };
}
