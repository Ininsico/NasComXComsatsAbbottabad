# Load tests

k6 scripts that exercise the real stack through nginx, not mocks.

| Script | Purpose |
| --- | --- |
| `smoke.js` | One pass over **every feature**, asserting what each endpoint should return. Run this after a deploy. |
| `load.js` | Mixed workload at increasing concurrency, with p95 and error-rate thresholds. |

Both default to `http://127.0.0.1:8085` — the frontend container on loopback. That goes
through the same path a browser would (nginx → backend → ai → chroma/redis) without
putting load through Cloudflare or hitting its rate limits. Point `BASE_URL` at the
public domain only when you deliberately want to measure the edge as well.

## Running them

```bash
bash deploy/scripts/install-k6.sh          # one-time

k6 run deploy/loadtest/smoke.js                                   # every feature, once
k6 run deploy/loadtest/load.js                                    # 10 VUs by default
k6 run -e VUS=25 -e HOLD=2m deploy/loadtest/load.js               # harder
k6 run -e INCLUDE_AI=1 deploy/loadtest/load.js                    # include Groq calls
k6 run -e BASE_URL=https://nascon.artdevelopers.site deploy/loadtest/smoke.js
```

Through GitHub Actions (runs on the deploy runner, nothing published):

```bash
gh workflow run loadtest.yml -f profile=smoke
gh workflow run loadtest.yml -f profile=load -f vus=25
```

## What the smoke test covers

Public: the SPA shell, `/deploy`, `/api/health` (including `redis.reachable`), campus
programmes/faculty/announcements, and the deploy status.

Authentication: student login, admin login, the session matching the account, and a
wrong password being rejected with 401.

Student features: account overview, profile, documents, payment plans/config/intents,
the knowledge namespace, and retrieval.

Assistant: a Groq-backed answer to a real campus question.

Admin: the console overview and the Binance wallet read.

Voice: `/voice/health` reporting STT configured and the queue worker alive, then a real
`/voice/tts` call returning `audio/*`.

Metrics: `/metrics` must **not** be publicly reachable — it is scraped internally.

Every one of those is a `check`; the thresholds require `checks: rate==1` and
`http_req_failed: rate==0`, so one red line means something is genuinely broken.

## The load profile

A weighted mix, closer to real traffic than hammering one endpoint:

- 55% anonymous browsing — campus programmes, faculty, announcements (batched)
- 25% signed-in dashboard — `/api/auth/me`, documents, payment plans
- 12% monitoring — deploy status and voice health
- 7% retrieval — embeddings plus the vector database, no generation
- 1% generated answers — **only when `INCLUDE_AI=1`**, because Groq is slow, costs
  quota, and would measure the provider rather than this system

Each VU logs in once and reuses the token; logging in every iteration would spend the
test inside bcrypt.

Thresholds: `p95 < 500 ms` for campus and auth reads, `< 800 ms` for documents,
`< 1500 ms` for retrieval, error rate under 2%, checks above 99%.

Environment: `VUS` (10), `RAMP` (30s), `HOLD` (1m), `BASE_URL`, `INCLUDE_AI`,
`STUDENT_EMAIL`/`STUDENT_PASSWORD`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Deliberately not tested under load

Uploads (Cloudinary), profile writes, payment intents and WhatsApp sends all mutate
state or cost money. They are exercised by the smoke test's read paths only. If you want
them load-tested, they need a disposable account and a fake upload first.
