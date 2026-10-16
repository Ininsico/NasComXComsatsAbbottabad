const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields ?? null;
  }
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
    throw new ApiError('Cannot reach the server. Make sure the API is running.', 0);
  }

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

export const api = {
  signup: (details) => request('/api/auth/signup', { method: 'POST', body: details }),
  login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  me: (token) => request('/api/auth/me', { token }),
  programs: () => request('/api/campus/programs'),
  faculty: () => request('/api/campus/faculty'),
  announcements: () => request('/api/campus/announcements'),
  overview: (token) => request('/api/account/overview', { token }),
};
