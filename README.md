# Nascom CRM

A multi-tenant SaaS CRM for 5–30 employee service businesses. Each company is an isolated
workspace with its own pipeline, contacts, messaging number and integrations. The product
requirement it is built against is in [`problemstatement.txt`](./problemstatement.txt).

## What it does

**Tenancy and access**
- Isolated workspaces: every read and write is filtered by the workspace the session belongs
  to, so a guessed identifier in another workspace finds nothing.
- Three base levels — Owner, Admin, User — plus roles built from permission bundles (a
  "Manager" is a role, not a fourth level). Nine granular permissions, enforced on every
  endpoint.
- Opportunity value is masked server-side: without `opportunity_value.view` the value is
  absent from lists, detail pages, the recovery queue, the dashboard and the CSV export.
  The screen shows "Restricted".
- The Owner can never be modified by an Admin, and the last Owner cannot demote themselves.

**The CRM**
- Companies → Contacts → Opportunities. A lead is the opportunity; its contact and company
  are resolved when it arrives, so the same person from a form, WhatsApp and manual entry is
  one record.
- Configurable pipeline: stages with labels, order, required fields, and closed/won flags.
  A stage that still holds opportunities cannot be deleted — the save is refused with the
  count. Moving into a stage whose required fields are missing is refused with the reason.
- Custom fields (text/number/date/dropdown/checkbox) with server-side validation, rendered
  on the new-lead form and the lead page.
- Saved lists: named criteria (13 fields × 8 comparisons) evaluated live against the
  pipeline, so a list shrinks and grows as records start and stop matching.
- Per-record activity history with the actor and timestamp: creation, assignment,
  acknowledgement, escalation, stage changes, field edits, notes, WhatsApp messages and
  appointments.

**Lead protection**
- Round-robin assignment to available members under their open-lead cap; the rotation
  survives restarts.
- A visible acknowledgement countdown. Recording any action — note, message, call, stage
  change, appointment — acknowledges the lead, not just the button.
- A configurable escalation ladder (next eligible rep → backup → manager) in seconds, run on
  a ticker every five seconds.
- Alerts to the new owner's own destinations first (Telegram/Slack/webhook), falling back to
  the workspace channels, retried with the attempt recorded. Every attempt is listed.
- The recovery queue lists anything unacknowledged past its window, escalated twice, or idle
  beyond the configured period, with the reason per item.

**Messaging, calendar, payments**
- WhatsApp per workspace: link a number by QR, inbound unknown numbers become a contact and
  a lead, messages are de-duplicated by provider id, delivery acknowledgements update the
  ledger, and "stop" opts a contact out (with the reason shown; "start" reverses it).
- Google Calendar OAuth for booking from a lead, with a conflict check and explicit
  timezone. Cancelling deletes the Google event first. A revoked token is detected and shown
  as "needs reconnection", and booking is refused with that reason.
- Payments: crypto (USDT deposit matching) and card (Stripe hosted checkout, test mode key in
  the environment). Card details never touch this server; subscriptions, invoices and the
  trial/limit enforcement live in `lib/subscriptions.js`.

**Operations**
- Tamper-evident audit log: every entry commits to the previous entry's hash, filterable by
  event type, actor and date, with before/after metadata. Read-only by design.
- Operational dashboard with new leads today, open pipeline value, average time to first
  response, recovery count, escalations in 24h, availability, upcoming appointments and
  collected vs projected revenue. Users see their own figures; Owner/Admin see company-wide.
- `/api/health`, Prometheus metrics at `/metrics`, and a Grafana/Prometheus stack in the
  deployment compose.

## Running it locally

Requirements: Node 20+, and (for the assistant) Python 3.10+.

```bash
# API
cd backend
cp .env.example .env        # fill in JWT_SECRET, and any integration keys
npm install
npm start                   # http://localhost:4000

# App
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

There are no seeded accounts. Create the first owner explicitly:

```bash
npm --prefix backend run owner:create -- --email you@company.com --name "Your Name"
```

That creates the account, its workspace and Owner membership, and prints the password it
generated. Sign-up is Google-only for everyone else: an unknown verified Google address gets
its own workspace as Owner.

Google sign-in needs the OAuth client to list the exact callbacks this server sends. Retrieve
them from `GET /api/auth/google-info`, or read them in the API's boot log:

- `http://localhost:4000/api/auth/google/callback` (sign in)
- `http://localhost:4000/api/calendar/callback` (appointments)

In production both become `https://<your-domain>/api/...`. `redirect_uri_mismatch` from Google
is always this — nothing else.

## Tests and checks

```bash
npm --prefix backend test          # 64 unit tests: assignment, payments, stripe, permissions, contacts
npm --prefix frontend run lint
npm --prefix frontend run build
node deploy/scripts/check-encoding.mjs .
```

## How it is put together

```
backend/src
  app.js            routers, raw-body Stripe webhook before the JSON parser
  lib/              db (JSON collections with atomic writes), auth, permissions, roles,
                    leads (the opportunity engine), companies, contacts, conversations,
                    savedLists, appointments, audit, alerts, subscriptions, stripe,
                    calendar, whatsapp (one linked device per workspace), knowledge (RAG)
  routes/           auth, crm (leads/lists/export/audit), companies, contacts, messages,
                    workspace (settings/members/roles), calendar, payments, subscriptions,
                    dashboard, integrations, whatsapp, deploy, admin
frontend/src
  pages/            Pipeline, Lead detail, Contacts, Contact detail, Companies, Company
                    detail, Recovery, Inbox, Appointments, Dashboard, Audit, Integrations,
                    Workspace settings, Subscription, Voice, Admin, auth pages
  lib/api.js        the API client, grouped per resource
AI/                 Flask service: embeddings, Chroma retrieval, Whisper STT, edge-tts voice
deploy/             Docker images, compose, nginx, Grafana/Prometheus, load tests,
                    .env.example and the deploy pipeline's scripts
```

Persistence is JSON collections under `backend/data/` (gitignored, atomic writes, one write
queue per collection), so the app runs with no database to install. The store and the HTTP
layer are separate: swapping in Postgres means replacing `lib/db.js`.

## Deployment

The stack runs in Docker: frontend (nginx + SPA), API, AI service, Chroma, RabbitMQ, Redis,
Prometheus, Grafana and exporters. Deployments run from GitHub Actions on a self-hosted
runner on the host — push to `main`, the runner builds the images tagged with the commit and
rolls the stack. Details, secrets and rollback are in [`deploy/README.md`](./deploy/README.md).

## Not built (deliberately)

Twilio WhatsApp/SMS (the linked `whatsapp-web.js` session is used instead), Stripe payments
created from an opportunity (crypto covers payments), full accounting, payroll, shift
scheduling, ad-platform analytics, a report builder, and training modules.
