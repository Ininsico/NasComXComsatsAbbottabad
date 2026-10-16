const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

/** The API this browser is actually talking to — surfaced in the UI for debugging. */
export const API_BASE_URL = BASE_URL;

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

    let response;

    try {
      response = await fetch(`${BASE_URL}/api/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    } catch {
      throw new ApiError(OFFLINE, 0);
    }

    return parse(response);
  },
};
