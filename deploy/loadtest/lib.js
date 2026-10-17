import http from 'k6/http';
import { check } from 'k6';

/**
 * Shared helpers for the load tests.
 *
 * By default the tests run against the frontend container on loopback, which exercises
 * the real path (nginx → backend → ai → chroma/redis) without putting load through
 * Cloudflare. Point BASE_URL at the public domain deliberately, not by accident.
 */
export const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:8085').replace(/\/+$/, '');

export const STUDENT = {
  email: __ENV.STUDENT_EMAIL || 'ayesha.siddiqui@comsats-abbottabad.edu.pk',
  password: __ENV.STUDENT_PASSWORD || 'Student123',
};

export const ADMIN = {
  email: __ENV.ADMIN_EMAIL || 'admin@comsats-abbottabad.edu.pk',
  password: __ENV.ADMIN_PASSWORD || 'Admin12345',
};

export function jsonHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** Log in and return the token, or null. The check makes a failure visible per VU. */
export function login(credentials = STUDENT, tag = 'login') {
  const response = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify(credentials),
    { ...jsonHeaders(), tags: { name: tag } },
  );

  const ok = check(response, {
    [`${tag} returns 200`]: (res) => res.status === 200,
    [`${tag} returns a token`]: (res) => Boolean(res.json('token')),
  });

  return ok ? response.json('token') : null;
}

/**
 * A token per VU, obtained once. Logging in on every iteration would spend most of the
 * test inside bcrypt and measure that instead of the feature under test.
 */
let cachedToken = null;

export function studentToken() {
  if (!cachedToken) cachedToken = login(STUDENT, 'login student');

  return cachedToken;
}

export function get(path, token, tag) {
  const response = http.get(`${BASE}${path}`, {
    ...(token ? authHeaders(token) : {}),
    tags: { name: tag },
  });

  check(response, { [`${tag} 200`]: (res) => res.status === 200 });

  return response;
}

export function post(path, body, token, tag) {
  const response = http.post(`${BASE}${path}`, JSON.stringify(body), {
    ...jsonHeaders(token),
    tags: { name: tag },
  });

  check(response, { [`${tag} 200`]: (res) => res.status === 200 });

  return response;
}

/** The checks the feature suite makes on bodies, kept in one place. */
export function expectArray(response, label) {
  check(response, { [`${label} is a non-empty array`]: (res) => Array.isArray(res.json()) && res.json().length > 0 });
}

export function expectObject(response, label) {
  check(response, { [`${label} is an object`]: (res) => res.json() !== null && typeof res.json() === 'object' });
}
