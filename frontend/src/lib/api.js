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
  login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  me: (token) => request('/api/auth/me', { token }),

  /** The exact callback URLs this server sends Google, so a mismatch can be fixed. */
  googleInfo: () => request('/api/auth/google-info'),
  /** The administrator instant-login button. 404s when it is not enabled. */
  instantLoginInfo: () => request('/api/auth/instant-login'),
  instantLogin: () => request('/api/auth/instant-login', { method: 'POST' }),
  adminOverview: (token) => request('/api/admin/overview', { token }),
  adminMetrics: (token) => request('/api/admin/metrics', { token }),

  // Public: the marketing site's demo form writes straight into the CRM pipeline.
  demoRequest: (payload) => request('/api/crm/demo-request', { method: 'POST', body: payload }),

  paymentConfig: (token) => request('/api/payments/config', { token }),
  paymentPlans: (token) => request('/api/payments/plans', { token }),
  paymentProviders: (token) => request('/api/payments/providers', { token }),
  paymentIntents: (token) => request('/api/payments/intents', { token }),
  createPaymentIntent: (token, planId, provider = 'crypto') =>
    request('/api/payments/intents', { method: 'POST', body: { planId, provider }, token }),
  checkPaymentIntent: (token, id) =>
    request(`/api/payments/intents/${id}/check`, { method: 'POST', token }),

  profile: (token) => request('/api/profile', { token }),
  saveProfile: (token, details) => request('/api/profile', { method: 'PUT', body: details, token }),
  uploadAvatar: (token, file) => {
    const form = new FormData();
    form.append('file', file);

    return requestForm('/api/profile/avatar', token, form);
  },

  whatsappStatus: (token) => request('/api/whatsapp/status', { token }),
  whatsappStart: (token) => request('/api/whatsapp/start', { method: 'POST', token }),
  whatsappStop: (token) => request('/api/whatsapp/stop', { method: 'POST', token }),
  whatsappLogout: (token) => request('/api/whatsapp/logout', { method: 'POST', token }),
  whatsappSend: (token, to, text) =>
    request('/api/whatsapp/send', { method: 'POST', body: { to, text }, token }),
};

/** Every connector a workspace can attach, in one read. */
export const integrationsApi = {
  all: (token) => request('/api/integrations', { token }),
};

/** The operational dashboard, read at one moment so the figures agree. */
export const dashboardApi = {
  get: (token) => request('/api/dashboard', { token }),
};

/** Plan, status, limits, invoices and checkout for the workspace subscription. */
export const subscriptionApi = {
  get: (token) => request('/api/subscription', { token }),
  checkout: (token, planId, provider) =>
    request('/api/subscription/checkout', { method: 'POST', body: { planId, provider }, token }),
  confirm: (token, intentId) =>
    request('/api/subscription/confirm', { method: 'POST', body: { intentId }, token }),
  cancel: (token) => request('/api/subscription/cancel', { method: 'POST', token }),
  resume: (token) => request('/api/subscription/resume', { method: 'POST', token }),
};

function query(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }

  const string = search.toString();

  return string ? `?${string}` : '';
}

/** The CRM workspace: pipeline, leads, activities, alerts and the audit log. */
export const crmApi = {
  meta: (token) => request('/api/crm/meta', { token }),
  stats: (token) => request('/api/crm/stats', { token }),
  leads: (token, params) => request(`/api/crm/leads${query(params)}`, { token }),
  recovery: (token) => request('/api/crm/recovery', { token }),
  lead: (token, id) => request(`/api/crm/leads/${encodeURIComponent(id)}`, { token }),
  createLead: (token, body) => request('/api/crm/leads', { method: 'POST', body, token }),
  updateLead: (token, id, body) =>
    request(`/api/crm/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteLead: (token, id) =>
    request(`/api/crm/leads/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  acknowledge: (token, id) =>
    request(`/api/crm/leads/${encodeURIComponent(id)}/acknowledge`, { method: 'POST', token }),
  assign: (token, id, memberId) =>
    request(`/api/crm/leads/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      body: { memberId },
      token,
    }),
  escalate: (token) => request('/api/crm/escalate', { method: 'POST', token }),
  activities: (token, leadId) =>
    request(`/api/crm/activities${query({ leadId })}`, { token }),
  addActivity: (token, body) =>
    request('/api/crm/activities', { method: 'POST', body, token }),
  alerts: (token) => request('/api/crm/alerts', { token }),
  audit: (token) => request('/api/crm/audit', { token }),
  lists: (token) => request('/api/crm/lists', { token }),
  createList: (token, body) => request('/api/crm/lists', { method: 'POST', body, token }),
  updateList: (token, id, body) =>
    request(`/api/crm/lists/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteList: (token, id) =>
    request(`/api/crm/lists/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  evaluateList: (token, id) =>
    request(`/api/crm/lists/${encodeURIComponent(id)}/evaluate`, { token }),
  /** CSV export. Gated by crm.export; the value column is present only if you may see it. */
  exportUrl: () => `${BASE_URL}/api/crm/export`,
};

/** The model above the pipeline: everyone's records, all permission-gated like the CRM. */
export const companiesApi = {
  all: (token) => request('/api/companies', { token }),
  create: (token, body) => request('/api/companies', { method: 'POST', body, token }),
  get: (token, id) => request(`/api/companies/${encodeURIComponent(id)}`, { token }),
  update: (token, id, body) =>
    request(`/api/companies/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  remove: (token, id) =>
    request(`/api/companies/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
};

export const contactsApi = {
  all: (token) => request('/api/contacts', { token }),
  create: (token, body) => request('/api/contacts', { method: 'POST', body, token }),
  get: (token, id) => request(`/api/contacts/${encodeURIComponent(id)}`, { token }),
  update: (token, id, body) =>
    request(`/api/contacts/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  remove: (token, id) =>
    request(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  optOut: (token, id, reason) =>
    request(`/api/contacts/${encodeURIComponent(id)}/opt-out`, { method: 'POST', body: { reason }, token }),
};

/** The WhatsApp conversation ledger around contacts and leads. */
export const messagesApi = {
  list: (token, { contactId, leadId, limit } = {}) =>
    request(
      `/api/messages${query({ contactId, leadId, limit })}`,
      { token },
    ),
  send: (token, body) => request('/api/messages/send', { method: 'POST', body, token }),
};

/** Workspace administration: settings, members and configurable roles. */
export const workspaceApi = {
  get: (token) => request('/api/workspace', { token }),
  updateSettings: (token, body) =>
    request('/api/workspace/settings', { method: 'PUT', body, token }),
  members: (token) => request('/api/workspace/members', { token }),
  inviteMember: (token, body) =>
    request('/api/workspace/members', { method: 'POST', body, token }),
  updateMember: (token, id, body) =>
    request(`/api/workspace/members/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  removeMember: (token, id) =>
    request(`/api/workspace/members/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  roles: (token) => request('/api/workspace/roles', { token }),
  createRole: (token, body) => request('/api/workspace/roles', { method: 'POST', body, token }),
  updateRole: (token, id, body) =>
    request(`/api/workspace/roles/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  removeRole: (token, id) =>
    request(`/api/workspace/roles/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
};

/** Google Calendar: status, the consent URL and appointment booking. */
export const calendarApi = {
  status: (token) => request('/api/calendar/status', { token }),
  authorize: (token) => request('/api/calendar/authorize', { token }),
  busy: (token, start, end) => request(`/api/calendar/busy${query({ start, end })}`, { token }),
  book: (token, body) => request('/api/calendar/book', { method: 'POST', body, token }),
  disconnect: (token) => request('/api/calendar/connection', { method: 'DELETE', token }),
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
