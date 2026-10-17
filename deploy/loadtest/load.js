import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE, authHeaders, studentToken } from './lib.js';

/**
 * Mixed-workload load test against the real stack.
 *
 * The mix follows what the site actually does: mostly anonymous browsing of campus
 * data, a smaller share of authenticated dashboard reads, a little monitoring traffic,
 * and retrieval-heavy AI reads. Groq calls are excluded by default — they are slow,
 * cost quota, and would measure the provider rather than this system. Enable them with
 * -e INCLUDE_AI=1 when you want that measured on purpose.
 *
 *   k6 run deploy/loadtest/load.js
 *   k6 run -e VUS=25 -e HOLD=2m deploy/loadtest/load.js
 *   k6 run -e INCLUDE_AI=1 -e BASE_URL=https://nascon.artdevelopers.site deploy/loadtest/load.js
 */
const VUS = Number(__ENV.VUS || 10);
const INCLUDE_AI = __ENV.INCLUDE_AI === '1';

export const options = {
  scenarios: {
    browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || '30s', target: VUS },
        { duration: __ENV.HOLD || '1m', target: VUS },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    checks: ['rate>0.99'],
    'http_req_duration{name:campus programs}': ['p(95)<500'],
    'http_req_duration{name:campus faculty}': ['p(95)<500'],
    'http_req_duration{name:campus announcements}': ['p(95)<500'],
    'http_req_duration{name:auth me}': ['p(95)<500'],
    'http_req_duration{name:documents}': ['p(95)<800'],
    'http_req_duration{name:ai retrieve}': ['p(95)<1500'],
  },
};

export default function browse() {
  const roll = Math.random();

  if (roll < 0.55) {
    // Anonymous visitor: the landing page and the campus data it loads.
    const responses = http.batch([
      ['GET', `${BASE}/api/campus/programs`, null, { tags: { name: 'campus programs' } }],
      ['GET', `${BASE}/api/campus/faculty`, null, { tags: { name: 'campus faculty' } }],
      ['GET', `${BASE}/api/campus/announcements`, null, { tags: { name: 'campus announcements' } }],
    ]);

    check(responses, {
      'campus data loads': (results) => results.every((result) => result.status === 200),
    });
  } else if (roll < 0.8) {
    // Signed-in member: the dashboard shell and its data.
    const token = studentToken();

    if (token) {
      const responses = http.batch([
        ['GET', `${BASE}/api/auth/me`, null, { ...authHeaders(token), tags: { name: 'auth me' } }],
        ['GET', `${BASE}/api/documents`, null, { ...authHeaders(token), tags: { name: 'documents' } }],
        ['GET', `${BASE}/api/payments/plans`, null, { ...authHeaders(token), tags: { name: 'payment plans' } }],
      ]);

      check(responses, {
        'the dashboard data loads': (results) => results.every((result) => result.status === 200),
      });
    }
  } else if (roll < 0.92) {
    // Monitoring and the voice health probe, which the UI polls too.
    const responses = http.batch([
      ['GET', `${BASE}/api/deploy/status`, null, { tags: { name: 'deploy status' } }],
      ['GET', `${BASE}/voice/health`, null, { tags: { name: 'voice health' } }],
    ]);

    check(responses, {
      'status endpoints answer': (results) => results.every((result) => result.status === 200),
    });
  } else if (roll < 0.99) {
    // Retrieval: embeddings plus the vector database, no generation.
    const token = studentToken();

    if (token) {
      const response = http.get(`${BASE}/api/ai/retrieve?q=admission%20dates`, {
        ...authHeaders(token),
        tags: { name: 'ai retrieve' },
      });

      check(response, { 'retrieval answers': (res) => res.status === 200 });
    }
  } else if (INCLUDE_AI) {
    // Deliberately rare: one in a hundred iterations when enabled.
    const token = studentToken();

    if (token) {
      const response = http.post(
        `${BASE}/api/ai/ask`,
        JSON.stringify({ question: 'When do admissions close?' }),
        {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          tags: { name: 'ai ask' },
        },
      );

      check(response, { 'the assistant answers': (res) => res.status === 200 });
    }
  }

  sleep(1 + Math.random() * 2);
}
