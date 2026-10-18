/**
 * Answer synthesis. Kept transport-only: the caller supplies the key, model,
 * endpoint and any latency knobs, so this module has no configuration of its own.
 */

export const DEFAULT_SYSTEM_PROMPT = `You are the assistant inside Nascom CRM, a multi-tenant CRM product, replying in a chat.
Keep replies short: one to three sentences, or a short list. Plain text only — no markdown headings or tables.

Product notes may be provided below. They describe how this system actually behaves:
- If they answer the question, answer from them, and name the page or setting involved (Pipeline, Recovery queue, Integrations, Workspace settings, Subscription).
- If they do not cover it, say what you do know from the notes and where in the app the person can check, rather than inventing behaviour. Never claim a feature exists unless the notes say so.
- If the question is not about this product at all — general knowledge, arithmetic, definitions, small talk — answer it normally and helpfully from your own knowledge.

Never refuse a question. If something genuinely is not built yet, say that plainly and suggest the closest thing that does exist.`;

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
        ? `${system}\n\nProduct notes (possibly relevant — ignore them if they are not):\n${context}`
        : `${system}\n\nNo product notes matched this question, so answer it from your own knowledge.`,
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
