import http from 'k6/http';
import { check, group } from 'k6';
import {
  ADMIN,
  BASE,
  STUDENT,
  authHeaders,
  expectArray,
  expectObject,
  get,
  jsonHeaders,
  login,
  post,
} from './lib.js';

/**
 * Feature smoke test: one pass over every part of the system, asserting what each
 * endpoint is actually supposed to return. This is the script to run after a deploy.
 *
 *   k6 run deploy/loadtest/smoke.js
 *   k6 run -e BASE_URL=https://nascon.artdevelopers.site deploy/loadtest/smoke.js
 *
 * Every check must pass and no request may fail, so a red result means something real.
 */
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
  },
};

export default function featureSmoke() {
  group('public site', () => {
    const home = http.get(`${BASE}/`, { tags: { name: 'spa' } });
    check(home, {
      'the SPA shell is served': (res) => res.status === 200 && res.body.includes('id="root"'),
    });

    const deployPage = http.get(`${BASE}/deploy`, { tags: { name: 'spa deploy' } });
    check(deployPage, {
      'the deploy page is served': (res) => res.status === 200 && res.body.includes('id="root"'),
    });

    const health = get('/api/health', null, 'health');
    check(health, {
      'the API reports ok': (res) => res.json('status') === 'ok',
      'the demo accounts are seeded': (res) => res.json('demoAccounts') === res.json('demoAccountsExpected'),
      'redis is reachable': (res) => res.json('redis.reachable') === true,
    });

    expectArray(get('/api/campus/programs', null, 'campus programs'), 'programs');
    expectArray(get('/api/campus/faculty', null, 'campus faculty'), 'faculty');
    expectArray(get('/api/campus/announcements', null, 'campus announcements'), 'announcements');

    const status = get('/api/deploy/status', null, 'deploy status');
    check(status, {
      'the deploy status has an inProgress flag': (res) => typeof res.json('inProgress') === 'boolean',
    });
  });

  group('authentication', () => {
    const student = login(STUDENT, 'login student');
    check(null, { 'a student can log in': () => Boolean(student) });

    if (student) {
      const me = get('/api/auth/me', student, 'me');
      check(me, {
        'the session belongs to the account that logged in': (res) => res.json('user.email') === STUDENT.email,
      });
    }

    const admin = login(ADMIN, 'login admin');
    check(null, { 'an admin can log in': () => Boolean(admin) });

    const rejected = http.post(
      `${BASE}/api/auth/login`,
      JSON.stringify({ email: STUDENT.email, password: 'definitely-wrong' }),
      { ...jsonHeaders(), tags: { name: 'login rejected' } },
    );
    check(rejected, {
      'a wrong password is rejected': (res) => res.status === 401,
    });
  });

  const student = login(STUDENT, 'login for features');
  const admin = login(ADMIN, 'login admin for features');

  group('student features', () => {
    if (!student) return;

    expectObject(get('/api/account/overview', student, 'account overview'), 'account overview');
    expectObject(get('/api/profile', student, 'profile'), 'profile');
    get('/api/documents', student, 'documents');
    expectArray(get('/api/payments/plans', student, 'payment plans'), 'payment plans');
    expectObject(get('/api/payments/config', student, 'payment config'), 'payment config');
    get('/api/payments/intents', student, 'payment intents');

    const namespace = get('/api/ai/namespace', student, 'ai namespace');
    expectObject(namespace, 'knowledge namespace');

    const retrieved = get('/api/ai/retrieve?q=admission%20dates', student, 'ai retrieve');
    check(retrieved, {
      'retrieval returns something': (res) => Array.isArray(res.json('hits')) || Array.isArray(res.json()),
    });
  });

  group('assistant (Groq + retrieval)', () => {
    if (!student) return;

    const asked = post('/api/ai/ask', { question: 'When do Fall 2026 admissions close?' }, student, 'ai ask');
    check(asked, {
      'the assistant answers': (res) => res.status === 200 && String(res.json('answer') ?? '').length > 0,
    });
  });

  group('admin features', () => {
    if (!admin) return;

    const overview = get('/api/admin/overview', admin, 'admin overview');
    expectObject(overview, 'admin overview');

    // Reads the Binance account, so this also proves the exchange integration is live.
    const wallet = get('/api/payments/wallet', admin, 'admin wallet');
    check(wallet, { 'the wallet reads the exchange': (res) => res.status === 200 });
  });

  group('voice pipeline', () => {
    const health = get('/voice/health', null, 'voice health');
    check(health, {
      'speech-to-text is configured': (res) => res.json('stt.configured') === true,
      'the audio queue worker is alive': (res) => res.json('queue.worker_alive') === true,
      'the broker is connected': (res) => res.json('queue.connected') === true,
    });

    const spoken = http.post(
      `${BASE}/voice/tts`,
      JSON.stringify({ text: 'Load test of the speech synthesiser.' }),
      { ...jsonHeaders(), tags: { name: 'voice tts' } },
    );
    check(spoken, {
      'text to speech returns audio': (res) =>
        res.status === 200 && String(res.headers['Content-Type'] ?? '').startsWith('audio/'),
    });
  });

  group('metrics', () => {
    // Internal only — Prometheus scrapes it over the compose network, so reaching it
    // here means the proxy is deliberately not exposing it.
    const direct = http.get(`${BASE}/metrics`, { tags: { name: 'metrics' } });
    check(direct, {
      'metrics are not exposed publicly': (res) => res.status !== 200 || !res.body.includes('http_requests_total'),
    });
  });
}
