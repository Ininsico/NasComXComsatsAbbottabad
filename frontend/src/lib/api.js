const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

/** The API this browser is actually talking to — surfaced in the UI for debugging. */
export const API_BASE_URL = BASE_URL;

/** The Python AI service (semantic embeddings + voice). */
export const VOICE_BASE_URL = (import.meta.env.VITE_VOICE_URL ?? 'http://127.0.0.1:8100').replace(
  /\/+$/,
  '',
);

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields ?? null;
  }
}

const OFFLINE = 'Cannot reach the server. Make sure the API is running.';

async function parse(response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.fields,
    );
  }

  return payload;
}

async function request(path, { method = 'GET', body, token } = {}) {
  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }

  return parse(response);
}

async function requestForm(path, token, form) {
  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }

  return parse(response);
}

export const api = {
  health: () => request('/api/health'),
  signup: (details) => request('/api/auth/signup', { method: 'POST', body: details }),
  login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  me: (token) => request('/api/auth/me', { token }),
  programs: () => request('/api/campus/programs'),
  faculty: () => request('/api/campus/faculty'),
  announcements: () => request('/api/campus/announcements'),
  overview: (token) => request('/api/account/overview', { token }),
  adminOverview: (token) => request('/api/admin/overview', { token }),
  adminMetrics: (token) => request('/api/admin/metrics', { token }),
  ask: (token, question) =>
    request('/api/assistant/ask', { method: 'POST', body: { question }, token }),

  documents: (token) => request('/api/documents', { token }),
  removeDocument: (token, id) => request(`/api/documents/${id}`, { method: 'DELETE', token }),

  paymentConfig: (token) => request('/api/payments/config', { token }),
  paymentPlans: (token) => request('/api/payments/plans', { token }),
  paymentIntents: (token) => request('/api/payments/intents', { token }),
  createPaymentIntent: (token, planId) =>
    request('/api/payments/intents', { method: 'POST', body: { planId }, token }),
  checkPaymentIntent: (token, id) =>
    request(`/api/payments/intents/${id}/check`, { method: 'POST', token }),
  wallet: (token) => request('/api/payments/wallet', { token }),

  uploadDocument: async (token, { file, title }) => {
    const form = new FormData();
    form.append('title', title ?? '');
    form.append('file', file);

    return requestForm('/api/documents', token, form);
  },

  profile: (token) => request('/api/profile', { token }),
  saveProfile: (token, details) => request('/api/profile', { method: 'PUT', body: details, token }),
  uploadAvatar: (token, file) => {
    const form = new FormData();
    form.append('file', file);

    return requestForm('/api/profile/avatar', token, form);
  },

  aiNamespace: (token) => request('/api/ai/namespace', { token }),
  aiIngest: (token, details) =>
    request('/api/ai/documents', { method: 'POST', body: details, token }),
  aiRemove: (token, sourceId) =>
    request(`/api/ai/documents/${encodeURIComponent(sourceId)}`, { method: 'DELETE', token }),
  aiAsk: (token, question) =>
    request('/api/ai/ask', { method: 'POST', body: { question }, token }),
  aiRetrieve: (token, question) =>
    request(`/api/ai/retrieve?q=${encodeURIComponent(question)}`, { token }),

  whatsappStatus: (token) => request('/api/whatsapp/status', { token }),
  whatsappStart: (token) => request('/api/whatsapp/start', { method: 'POST', token }),
  whatsappStop: (token) => request('/api/whatsapp/stop', { method: 'POST', token }),
  whatsappSend: (token, to, text) =>
    request('/api/whatsapp/send', { method: 'POST', body: { to, text }, token }),
};

/** Which STT model, TTS engine and VAD settings the Python service is using. */
export async function voiceHealth() {
  const response = await fetch(`${VOICE_BASE_URL}/voice/health`);

  if (!response.ok) {
    throw new ApiError('The voice service is not responding', response.status);
  }

  return response.json();
}

/**
 * Whether a deployment is currently replacing the stack. Returns null when the API
 * cannot be reached — which is exactly what happens mid-deploy — so the caller can
 * keep showing the last known state instead of flickering the banner away.
 */
export async function deployStatus() {
  try {
    const response = await fetch(`${BASE_URL}/api/deploy/status`);

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * One conversational turn: the recording goes to the Python service, which runs
 * VAD, Whisper, retrieval and TTS, and returns the transcript, answer and audio.
 */
export async function voiceChat({ audio, userId }) {
  const form = new FormData();
  form.append('audio', audio, 'speech.wav');
  form.append('user_id', userId);

  let response;

  try {
    response = await fetch(`${VOICE_BASE_URL}/voice/chat`, { method: 'POST', body: form });
  } catch {
    throw new ApiError('Cannot reach the voice service. Start it with: npm run embed', 0);
  }

  return parse(response);
}
