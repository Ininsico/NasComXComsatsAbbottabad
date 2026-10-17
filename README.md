# COMSATS Abbottabad — Campus Management

A campus management website for COMSATS Abbottabad, built as a submission for the NasCom Web Dev
hackathon.

It is a public marketing site (landing page plus sub-pages) backed by a real Express API, with a
working account system: sign up, log in, and a role-aware portal for students, parents and faculty.

## Demo accounts

The API seeds these accounts on first boot (and `npm run seed` re-runs it safely). The sign-in page
has an **instant login dropdown** so you can jump straight into any of them.

| Role          | Email                                        | Password     | What you will see                             |
| ------------- | -------------------------------------------- | ------------ | --------------------------------------------- |
| Administrator | `admin@comsats-abbottabad.edu.pk`            | `Admin12345` | The admin console — every account and record   |
| Student       | `ayesha.siddiqui@comsats-abbottabad.edu.pk`  | `Student123` | Semester 6 record, GPA, an outstanding fee     |
| Student       | `hamza.riaz@comsats-abbottabad.edu.pk`       | `Student123` | Same shape, top of merit, all dues cleared     |
| Parent        | `rubina.aslam@comsats-abbottabad.edu.pk`     | `Parent123`  | One linked ward with her attendance and fees   |
| Faculty       | `sadia.khan@comsats-abbottabad.edu.pk`       | `Faculty123` | Teaching load, advisees, every student's files |

## What is in the repo

```
.
├── frontend/          React 19 + Vite single-page app
│   ├── public/        logo.png (the site logo, also the favicon)
│   └── src/
│       ├── components/   Layout, AppLayout, Sidebar, Navbar, Footer, AsyncSection,
│       │                 ErrorCard, Skeletons, AuthShell, ProtectedRoute, ...
│       ├── context/      AuthProvider, ToastProvider (+ their hooks)
│       ├── data/         Navigation, contact details and demo accounts
│       ├── hooks/        useApiResource
│       ├── lib/          API client, formatters
│       └── pages/        Home, About, Academics, Admissions, Faculty, Contact,
│                         Login, Signup, Dashboard, NotFound
├── backend/           Express 5 API
│   ├── src/data/      Seed dataset (programmes, faculty, announcements, records)
│   ├── src/lib/       Store, auth, validation, overview builder, seeding
│   └── data/          Runtime JSON user store (gitignored)
└── AI/                Reserved for future work
```

## Pages

| Route         | Page                                                              |
| ------------- | ----------------------------------------------------------------- |
| `/`           | Landing page — hero, highlights, live notice board, testimonials  |
| `/about`      | Campus history, mission, leadership                               |
| `/academics`  | Faculties and programmes (from the API), facilities, exams FAQ     |
| `/admissions` | Six-step process, eligibility table (from the API), fees, FAQs     |
| `/faculty`    | Departments table and faculty directory (from the API)            |
| `/contact`    | Validated enquiry form and campus contact details                 |
| `/login`      | Sign in, with instant demo login dropdown                         |
| `/signup`     | Create an account (student / parent / faculty)                    |
| `/dashboard`  | Portal — dark collapsible sidebar plus a role-aware dashboard      |
| `/documents`  | File uploads on Cloudinary; students upload, teachers see everything |
| `/admin`      | Admin console: accounts, student records, files, integrations      |
| `/payments`   | Subscription plans and crypto deposits, confirmed automatically    |
| `/profile`    | Member profile: contact, guardian details and a Cloudinary photo    |
| `/knowledge`  | The member's own RAG space: ask, index documents, inspect namespaces |
| `/voice`      | Spoken conversation: mic capture, VAD, transcription and spoken answers |

## Getting started

Install everything once:

```bash
npm run install:all
```

### 1. Start the API

```bash
npm run dev:backend
```

Runs on `http://localhost:4000` and seeds the demo accounts on first boot. Configuration comes from
`backend/.env` (copy `backend/.env.example` to recreate it). `JWT_SECRET` is **required** when
`NODE_ENV=production` — the server refuses to start without it.

### 2. Start the frontend

In a second terminal:

```bash
npm run dev:frontend
```

Open `http://localhost:5173`. The frontend talks to the API at `VITE_API_URL` (defaults to
`http://localhost:4000`; copy `frontend/.env.example` to override).

## API

Base URL: `http://localhost:4000`

| Method | Endpoint                    | Auth   | Body                               | Returns               |
| ------ | --------------------------- | ------ | ---------------------------------- | --------------------- |
| GET    | `/api/health`               | —      | —                                  | `{ status, env }`     |
| POST   | `/api/auth/signup`          | —      | `{ name, email, password, role? }` | `{ token, user }`     |
| POST   | `/api/auth/login`           | —      | `{ email, password }`              | `{ token, user }`     |
| GET    | `/api/auth/me`              | Bearer | —                                  | `{ user }`            |
| GET    | `/api/campus/programs`      | —      | —                                  | `{ programs }`        |
| GET    | `/api/campus/faculty`       | —      | —                                  | `{ faculty }`         |
| GET    | `/api/campus/announcements` | —      | —                                  | `{ announcements }`   |
| GET    | `/api/account/overview`     | Bearer | —                                  | role-aware dashboard  |
| GET    | `/api/documents`            | Bearer | —                                  | visible files         |
| POST   | `/api/documents`            | Bearer | `multipart` (`file`, `title?`)      | `{ document }`        |
| DELETE | `/api/documents/:id`        | Bearer | —                                  | `{ removed }`         |
| GET    | `/api/admin/overview`       | Admin  | —                                  | whole-campus snapshot |
| POST   | `/api/assistant/ask`        | Bearer | `{ question }`                     | `{ answer, model }`   |
| GET    | `/api/payments/plans`       | Bearer | —                                  | `{ plans }`           |
| GET    | `/api/payments/intents`     | Bearer | —                                  | own intents (all for admin) |
| POST   | `/api/payments/intents`     | Bearer | `{ planId }`                       | `{ intent, addressTag }` |
| POST   | `/api/payments/intents/:id/check` | Bearer | —                            | `{ intent, updated }` |
| GET    | `/api/payments/wallet`      | Admin  | —                                  | balances + key permissions |
| GET    | `/api/profile`              | Bearer | —                                  | profile + completeness |
| PUT    | `/api/profile`              | Bearer | profile fields + `name`            | updated profile       |
| POST   | `/api/profile/avatar`       | Bearer | `multipart` (`file`, image)        | `{ profile }`         |
| GET    | `/api/ai/namespace`         | Bearer | —                                  | namespaces + live backend |
| POST   | `/api/ai/documents`         | Bearer | `{ title, text }`                  | `{ document }`        |
| DELETE | `/api/ai/documents/:sourceId` | Bearer | —                                | `{ removed }`         |
| POST   | `/api/ai/ask`               | Bearer | `{ question }`                     | `{ answer, sources }` |
| GET    | `/api/ai/retrieve`          | Bearer | `?q=`                              | retrieved passages    |
| GET    | `/api/whatsapp/status`      | Admin  | —                                  | client state + QR     |
| POST   | `/api/whatsapp/start`       | Admin  | —                                  | boots the WhatsApp client |
| POST   | `/api/whatsapp/stop`        | Admin  | —                                  | stops it              |
| POST   | `/api/whatsapp/send`        | Admin  | `{ to, text }`                     | sends a message       |
| GET    | `/api/voice/…`              | —      | —                                  | see below — these live on the Python service (:8100) |

Validation failures return `400` with a per-field `fields` object. Duplicate emails return `409`,
bad credentials `401`. Passwords are hashed with bcrypt and never leave the API; sessions use signed
JWTs valid for 7 days. `role` is whitelisted, so nobody can self-register as an admin.

### How the dashboard data is derived

`GET /api/account/overview` returns a different shape per role:

- **student** — enrolment record, GPA and credit-weighted attendance computed from the course list,
  current courses, fee history and announcements.
- **parent** — every linked ward (resolved from the user store) with the same summary.
- **faculty** — teaching load, advisees and pending grading.

Grades are converted to grade points to work out the GPA, and attendance is weighted by credit
hours, so the numbers cannot drift out of sync with the course data. A brand new signup gets a
sensible empty state rather than an error.

## Design system

One calm, cohesive system — adapt content, never classes.

- **Palette** — blue is the anchor (`--blue-600` `#2563eb`), with slate neutrals and semantic tints:
  blue for default, **amber** for pending, **emerald** for done, **rose** for problems.
- **Status** is always a pill or a tinted tile (`.pill--pending`, `.tint-emerald`, …), never bare
  coloured text.
- **Radius** — `rounded-xl` (0.75rem) for buttons and inputs, `rounded-2xl` (1rem) for cards, and
  2rem for the hero card.
- **Type** — Poppins. Tiny bold uppercase `10px` labels (`.label-micro`, `.tile__label`) sit above
  `text-sm` / `text-xs` bold values, with muted slate for secondary information.
- **Interaction** — every transition is `200ms` and hovers shift tint rather than size. Focus is
  always visible via a 2px blue ring.
- **Lines & depth** — thin low-contrast borders (`--line`) and two named shadows: `--shadow-card`
  and `--shadow-dropdown`.
- **Loading** — shape-matched skeletons (`.skeleton--card`, `.skeleton--tile`, `.skeleton--row`),
  never spinners.
- **Errors** — a friendly centered card with a rose-tinted icon tile (`ErrorCard`).
- **Alerts** — every message funnels through one API: `showToast()` / `showAlert()` from
  `useToast()`.

**Layout** — public pages use a fixed translucent header and a 1280px container. The signed-in
portal is a dark collapsible sidebar (translucent `white/10` overlays, white logo plate) with a
light airy content area capped at 1600px.

## Integrations

Both are configured in `backend/.env` and are optional — the app degrades gracefully when a key is
missing, and the admin console shows each one as connected or not configured.

**Cloudinary — file uploads.** Students, faculty and administrators upload through
`POST /api/documents`; the file goes to Cloudinary (folder set by `CLOUDINARY_FOLDER`, 8 MB limit)
and only the metadata is stored locally. Visibility is scoped by role: students see their own
uploads, **faculty and admins see every file**, and parents see files belonging to their linked
ward (read-only). Deleting a document removes both the metadata and the remote asset.

**Groq — campus assistant.** `POST /api/assistant/ask` answers questions using the seeded campus
data (programmes, requirements, key dates, announcements) as context. The model is set by
`GROQ_MODEL`; list what your key can access with:

```bash
curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```

If a call fails, the API passes Groq's own error message through so a wrong model name is obvious.

**Binance — subscription payments (read-only).** A student picks a plan and the API opens a deposit
window: it fetches the live deposit address for `BINANCE_DEPOSIT_COIN` / `BINANCE_DEPOSIT_NETWORK`,
records the expected amount with a ±10% band (`PAYMENT_TOLERANCE_PERCENT`) and expires after an
hour. A background watcher polls Binance deposit history every `PAYMENT_POLL_SECONDS` seconds and
settles each intent as the money arrives:

- **within the band** → `confirmed`; above it → `overpaid` (accepted, but flagged for the finance office)
- **below the band** → `mismatch`, stating the shortfall so a top-up can complete it
- several deposits sum towards one subscription, and a transaction can only ever be claimed once,
  so two subscriptions can never share a single deposit

**This integration is deliberately read-only.** `backend/src/lib/binance.js` exposes no generic
request helper — only signed GETs for balances, deposit history and the deposit address — so no
order, transfer or withdrawal route is reachable from this codebase. The admin wallet panel also
reports the key's own `canTrade` / `canWithdraw` flags, so an over-permissioned key is visible
rather than silent.

> Use a key with **Enable Reading** only, plus an IP whitelist. A key with trading or withdrawal
> enabled can drain the account if the secret ever leaks.

The admin console values the whole portfolio: it marks holdings to market using Binance's public
ticker, converts everything to USDT, and reports the **total portfolio value**, deposits received
and subscription revenue, alongside the settled/pending/mismatched intent table. Holdings with no
USDT market are listed but excluded from the total, and the panel never throws — if Binance is
unreachable it says so instead of failing the console.

## Member profiles

Every account gets a `/profile` page with a completeness meter. Members can set a phone number,
date of birth, address and city, guardian name and phone, programme and section, a short bio, and a
profile photo; their name is written back to the account record. Facts the registrar owns —
registration number, semester, advisor, department — are shown read-only alongside it. Photos upload
to the same Cloudinary account (up to 8 MB) and the secure URL is stored on the profile.

## Retrieval-augmented AI

`AI/` is a self-contained RAG pipeline — see `AI/README.md`, and `AI/PROMPTS.md` for the reusable
prompt behind the WhatsApp flow.

**Embeddings are genuinely semantic**, not a bag of words: `AI/main.py` serves
`BAAI/bge-small-en-v1.5` (384 dimensions) through fastembed/ONNX, and the Node side calls it.
That is what lets "When is the athletics festival?" retrieve a document about the "sports gala".

> **Groq does not do embeddings.** `/v1/embeddings` rejects every model on the key with
> *"the model does not support embeddings"*. Groq is used for the answer step only.

**Chroma** is the vector database and every namespace is its own collection, so a member's
documents live in a genuinely separate vector space rather than being filtered at query time.

| Namespace       | Holds                             | Who can retrieve it |
| --------------- | --------------------------------- | ------------------- |
| `shared:campus` | programmes, faculty, policies      | everyone            |
| `user:<id>`     | one member's own documents         | that member only    |
| `wa:<number>`   | an unrecognised WhatsApp sender's  | that sender only    |

The collection prefix follows the embedder (`sem-` for semantic, `ns-` for the hashed fallback),
so switching models starts a new index instead of corrupting the existing one.

```bash
pip install chromadb fastembed flask flask-cors
npm run embed           # starts Chroma (8000) AND the embedding service (8100)
```

`python AI/main.py` (what `npm run embed` calls) **owns the Python side**: it locates the `chroma`
CLI wherever pip installed it, starts it as a child process if nothing is already listening on
`CHROMA_PORT`, waits for its heartbeat, logs to `AI/data/chroma.log`, and stops it again on Ctrl+C.
If Chroma is already running elsewhere it just uses it. Set `CHROMA_AUTOSTART=false` to keep the old
behaviour and run Chroma separately with `npm run chroma`.

Either dependency can be missing: without Chroma the pipeline uses a bundled vector store, and
without the embedding service it falls back to hashed vectors. Both fallbacks are logged, and the
`/knowledge` page shows which backend and which embedder are actually serving.

`python AI/main.py` also exposes `/ingest`, `/search` and `/ask`, so the whole pipeline can be
exercised from Python alone.

## WhatsApp assistant

`whatsapp-web.js` runs inside the API. Incoming messages are answered from the same RAG pipeline:
the sender's number is matched against member profile phone numbers, so a reply is grounded in that
member's own vector space plus the shared campus one. An unknown number still gets an isolated
namespace, so it can ask campus questions without ever reaching another member's documents.

### Linking a device (once)

```bash
npm --prefix backend run whatsapp:pair     # prints a scannable QR, waits for the scan
npm --prefix backend run whatsapp:status   # is a session stored, and does it still connect?
npm --prefix backend run whatsapp:logout -- --yes   # forget it and re-pair
```

`whatsapp:pair` renders the QR in the terminal **and** writes `backend/data/whatsapp-qr.png` if the
terminal code is awkward to scan. The admin console shows the same QR, so either route works.

Once linked, a marker is written next to the session and the API auto-connects on every boot with no
scan, reusing the stored device registration. `whatsapp:status` is the honest check: it actually
connects, so a session that has been revoked by WhatsApp reports `NOT paired` rather than pretending.

The session lives in `backend/data/whatsapp-session/` (~100 MB Chromium profile) and is gitignored.
**Treat those files as credentials** — they are enough to connect as that WhatsApp account — so never
commit them, paste them into a chat, or copy them anywhere untrusted. `whatsapp:logout` deletes them.

> Auto-start only happens when a linked session exists, so `whatsapp:pair` never has to compete with
> the running API for the same browser profile. Set `WHATSAPP_ENABLED=true` only to force a client
> with no session yet.

## Voice assistant

`/voice` in the portal is a spoken conversation with the same RAG brain. Everything runs locally
except Whisper and the LLM.

| Piece    | What it uses                                                    | Notes |
| -------- | --------------------------------------------------------------- | ----- |
| **VAD**  | Web Audio `AnalyserNode` in the browser, energy VAD in Python    | The browser learns the room noise for ~0.5 s, starts recording on speech and stops after 900 ms of silence. The server re-analyses the WAV, reports speech segments and trims silence before transcription. |
| **STT**  | Groq `whisper-large-v3-turbo`                                    | 400–650 ms. A prompt biases the decoder toward campus vocabulary so "COMSATS" survives. |
| **TTS**  | `edge-tts` (`en-US-AriaNeural`), Windows SAPI as fallback        | Edge voices need network; SAPI is offline. Groq's own TTS models are unusable on this key — one needs terms accepted, the other is decommissioned. |
| **Reply**| The RAG pipeline + Groq                                          | Scoped to the member's own vector space plus `shared:campus`. |

The client downsamples to 16 kHz mono WAV, which both the Python VAD and Whisper read directly — no
uploaded webm to decode.

| Method | Endpoint (on `:8100`) | Body                              | Returns |
| ------ | --------------------- | --------------------------------- | ------- |
| GET    | `/voice/health`       | —                                 | engines + VAD settings |
| POST   | `/voice/stt`          | `multipart` (`audio`)             | `{ text, vad, seconds }` |
| POST   | `/voice/tts`          | `{ text, voice?, engine? }`       | audio bytes (`audio/mpeg` or `audio/wav`) |
| POST   | `/voice/chat`         | `multipart` (`audio`, `user_id`)  | `{ transcript, answer, audio, sources, timings }` |

`/voice/chat` is one turn: VAD → Whisper → retrieval → Groq → speech, returning the answer and the
audio together. The service binds to `127.0.0.1`; point the UI elsewhere with `VITE_VOICE_URL`.

Measured end to end on synthetic speech: **STT 393 ms, LLM 1.28 s, TTS 2.5 s** — roughly 4.3 s per
spoken turn, with TTS the dominant cost.

> Note: Cloudflare in front of Groq answers `403` (error 1010) to Python's default
> `urllib` User-Agent, so every outbound request from the Python service sets one explicitly.

## Audio queue

Voice turns cannot run concurrently: two at once would fight over the same Groq quota
and the same speaker. RabbitMQ arbitrates.

`AI/audio_queue.py` publishes each recording to a durable `voice.audio` queue and
drains it with a **single consumer using `prefetch_count=1`**, so the broker — not
luck — is what guarantees one job in flight. The `ai` service is therefore never
replicated; a second replica would be a second consumer.

A recording is ~450 KB once base64-encoded, and pushing that through the broker to a
remote host cost 4.5 s of pickup latency on a 330 kbps uplink, against 0.3 s for a
small message. So the audio is written to a spool file and only its id travels in the
message (the claim-check pattern), drained as jobs complete and swept on startup. On
the server, where the broker is on loopback, queue wait measures **3–5 ms**.

Queue depth, in-flight count, job counters and spool files are exposed at
`GET /voice/queue` and included in `/voice/health`. With no reachable broker the
service falls back to an in-process lock, which also prevents overlap.

## Deployment

Everything ships as containers and deploys through GitHub Actions — see
[deploy/README.md](deploy/README.md) for the full runbook.

| File | What it does |
| --- | --- |
| `docker-compose.yml` | frontend, backend, ai, chroma, redis, and the official RabbitMQ image |
| `deploy/docker/*.Dockerfile` | one image per service |
| `deploy/scripts/bootstrap-vm.sh` | prepares a host: Docker, vhost, certificate |
| `deploy/scripts/install-runner.sh` | adds self-hosted Actions runners |
| `.github/workflows/ci.yml` | lint, build, boot the API, import the AI, build images |
| `.github/workflows/deploy.yml` | builds on the host and restarts the stack in place |

The workflow runs on a self-hosted runner **on the deployment host**, so a push to
`main` builds the images there and restarts the stack in place — no registry, no SSH,
no files copied over. Progress is reported per stage and per container, and
[/deploy](https://nascon.artdevelopers.site/deploy) shows it; while a deploy runs that
panel takes over the screen.

Data survives every deploy in named volumes: the vector database, uploaded documents and
accounts, and the linked WhatsApp session (so it never asks for a QR scan again).

Live at <https://nascon.artdevelopers.site>.

## Data storage

Accounts are persisted to `backend/data/users.json` using atomic writes, and it is gitignored so
each environment starts with an empty store. Programme, faculty, announcement and academic-record
data lives in `backend/src/data/` so it is version controlled. Swap `backend/src/lib/store.js` for a
real database when you outgrow it — nothing else depends on its internals.

## Scripts

| Command                  | Description                         |
| ------------------------ | ----------------------------------- |
| `npm run install:all`    | Install frontend + backend deps     |
| `npm run dev:frontend`   | Vite dev server                     |
| `npm run dev:backend`    | API with file watching + seeding    |
| `npm run build:frontend` | Production build to `frontend/dist` |
| `npm run lint:frontend`  | ESLint                              |
| `npm --prefix backend run seed` | Re-seed demo accounts        |
