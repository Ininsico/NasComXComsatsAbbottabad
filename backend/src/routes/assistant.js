import { Router } from 'express';
import { config } from '../config.js';
import { ANNOUNCEMENTS, FACULTY, PROGRAMS } from '../data/campus.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();

function campusFacts() {
  const programmes = PROGRAMS.map(
    (programme) =>
      `- ${programme.name} (${programme.faculty}, ${programme.level}, ${programme.duration}, ` +
      `${programme.credits} credit hours, ${programme.seats} seats). ` +
      `Entry: ${programme.requirement}. Test: ${programme.test}.`,
  ).join('\n');

  const announcements = ANNOUNCEMENTS.map(
    (item) => `- ${item.date} · ${item.title} [${item.category}, for ${item.audience}]: ${item.body}`,
  ).join('\n');

  const departments = [...new Set(FACULTY.map((member) => member.department))].join(', ');

  return [
    'Campus facts:',
    '- Institution: COMSATS University Islamabad, Abbottabad Campus.',
    '- Address: Park Road, Abbottabad, Khyber Pakhtunkhwa, Pakistan.',
    '- Established 1998. Semester system with Fall and Spring intakes.',
    `- Departments: ${departments}.`,
    '- Fall 2026 admissions: applications open 1 June 2026, close 31 July 2026. Entrance test 9 August 2026. First merit list 18 August 2026. Classes begin 8 September 2026.',
    '- Admission steps: create an account, submit the online form, upload documents, pay the processing fee, merit list and interview, then confirm admission.',
    '- Administration office hours: Monday to Friday, 8:30 AM to 4:30 PM.',
    '',
    'Programmes:',
    programmes,
    '',
    'Latest announcements:',
    announcements,
  ].join('\n');
}

const SYSTEM_PROMPT = `You are the campus assistant for COMSATS Abbottabad, embedded in the campus portal.
Use only the campus facts provided below. Be concise and friendly — at most four short sentences, or a short list.
If the facts do not cover the question, say you do not have that information and suggest contacting the administration office.`;

router.post('/ask', requireAuth, async (req, res) => {
  if (!config.groq.configured) {
    return res.status(503).json({ error: 'The campus assistant is not configured on the server' });
  }

  const question = String(req.body?.question ?? '').trim();

  if (question.length < 3) {
    return res.status(400).json({ error: 'Please ask a longer question' });
  }

  if (question.length > 600) {
    return res.status(400).json({ error: 'Please keep questions under 600 characters' });
  }

  let response;

  try {
    response = await fetch(config.groq.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.groq.apiKey}`,
      },
      body: JSON.stringify({
        model: config.groq.model,
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${campusFacts()}` },
          { role: 'user', content: question },
        ],
      }),
    });
  } catch {
    return res.status(502).json({ error: 'Could not reach the assistant service' });
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);

    return res.status(502).json({
      error:
        detail?.error?.message ??
        `The assistant replied with status ${response.status}. Check GROQ_MODEL is available to your key.`,
    });
  }

  const payload = await response.json().catch(() => null);
  const answer = payload?.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    return res.status(502).json({ error: 'The assistant returned an empty answer' });
  }

  return res.json({ answer, model: payload.model ?? config.groq.model });
});

export default router;
