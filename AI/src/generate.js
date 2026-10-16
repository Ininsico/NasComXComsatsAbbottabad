/**
 * Answer synthesis. Kept transport-only: the caller supplies the key, model and
 * endpoint, so this module has no configuration dependency of its own.
 */

export const DEFAULT_SYSTEM_PROMPT = `You are the campus assistant for COMSATS Abbottabad.
Answer the question using the retrieved context below and nothing else.
If the context does not contain the answer, say so plainly and suggest contacting the administration office.
Be concise: at most four short sentences, or a short list.`;

export async function generateAnswer({
  apiKey,
  model,
  endpoint = 'https://api.groq.com/openai/v1/chat/completions',
  system = DEFAULT_SYSTEM_PROMPT,
  question,
  context,
  maxTokens = 600,
  temperature = 0.2,
}) {
  if (!apiKey) throw new Error('No generation API key was provided');
  if (!question) throw new Error('A question is required');

  const messages = [
    {
      role: 'system',
      content: context
        ? `${system}\n\nRetrieved context:\n${context}`
        : `${system}\n\nNo context was retrieved for this question.`,
    },
    { role: 'user', content: question },
  ];

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
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
