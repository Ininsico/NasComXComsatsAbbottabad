/**
 * Answer synthesis. Kept transport-only: the caller supplies the key, model,
 * endpoint and any latency knobs, so this module has no configuration of its own.
 */

export const DEFAULT_SYSTEM_PROMPT = `You are the friendly assistant for COMSATS Abbottabad, replying in a chat.
Keep replies short: one to three sentences, or a short list. Plain text only — no markdown headings or tables.

Campus notes may be provided below. Use them like this:
- If they answer the question, answer from them and stay faithful to them.
- If they are unrelated to the question, ignore them completely.
- If the question is not about the campus at all — general knowledge, arithmetic, definitions, small talk, anything else — just answer it normally and helpfully from your own knowledge.

Never reply that you cannot answer, and never tell someone to contact an office unless the question is specifically about campus business and no note covers it. Even then, share whatever you do know first, then offer the office as a follow-up.`;

export async function generateAnswer({
  apiKey,
  model,
  endpoint = 'https://api.groq.com/openai/v1/chat/completions',
  system = DEFAULT_SYSTEM_PROMPT,
  question,
  context,
  maxTokens = 400,
  temperature = 0.3,
  reasoningEffort,
}) {
  if (!apiKey) throw new Error('No generation API key was provided');
  if (!question) throw new Error('A question is required');

  const messages = [
    {
      role: 'system',
      content: context
        ? `${system}\n\nCampus notes (possibly relevant — ignore them if they are not):\n${context}`
        : `${system}\n\nNo campus notes matched this question, so answer it from your own knowledge.`,
    },
    { role: 'user', content: question },
  ];

  const body = { model, messages, max_tokens: maxTokens, temperature };

  // gpt-oss models are reasoning models; "low" cuts a lot of latency for chat.
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('The generation service is unreachable');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Generation failed with status ${response.status}`);
  }

  const answer = payload?.choices?.[0]?.message?.content?.trim();

  if (!answer) throw new Error('The generation service returned an empty answer');

  return { answer, model: payload.model ?? model };
}
