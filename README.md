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
