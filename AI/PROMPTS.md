can# Reusable prompts

## 1. The WhatsApp QR pairing flow (whatsapp-web.js)

Paste this into an agent to rebuild the WhatsApp feature from scratch.

---

**Task: add a WhatsApp assistant to a Node/Express API, linked by scanning a QR code.**

Build it with `whatsapp-web.js`, running inside the existing Express process, with these
requirements:

**Client lifecycle**
- Create the client with `LocalAuth` so the session persists on disk
  (`clientId` + `dataPath`), meaning the QR only has to be scanned once and later boots
  reconnect silently.
- Launch headless Chromium via `puppeteer`; allow an `executablePath` override from config so a
  system Chrome can be used instead of the bundled one, and pass `--no-sandbox`,
  `--disable-setuid-sandbox`, `--disable-dev-shm-usage`.
- Expose `start()`, `stop()` and `status()` functions. `start()` must be idempotent: if it is
  already starting or started, return the current status rather than launching a second browser.

**State machine and QR exposure**
- Track a single state object: `status`, `qr`, `qrDataUrl`, `lastQrAt`, `me`, `error`, `readyAt`,
  `received`, `replied`, `lastMessageAt`.
- Status transitions: `stopped` → `starting` → `qr` → `authenticated` → `ready`, with `error` and
  `disconnected` reachable from anywhere.
- On the `qr` event, render the raw string to a PNG data URL with the `qrcode` package
  (`toDataURL`, ~320px, margin 1) and store it as `qrDataUrl` so a browser can display it
  directly with `<img src={qrDataUrl}>` — no files, no external QR service.
- Clear the QR from state on `authenticated` and `ready`.
- Wire `auth_failure` and `disconnected` to the `error`/`disconnected` states with the reason text.

**Admin endpoints (admin role only)**
- `GET /status` → the whole state object, including `qrDataUrl`.
- `POST /start`, `POST /stop` → run the lifecycle and return the new status.
- `POST /send { to, text }` → normalise the number to digits and send to `<digits>@c.us`;
  return `{ id, to }` or a clear error when the client is not connected.

**Admin UI**
- A panel showing a status pill driven by the state (`Scan the QR code`, `Connected`, `Error`, …),
  received/replied counters, and Start / Stop / Refresh buttons.
- While the status is `starting` or `qr`, poll the status endpoint every 4 seconds so the QR stays
  fresh, and stop polling once it reaches `ready`.
- Render the QR from `qrDataUrl` inside a bordered card with the caption
  "Scan with WhatsApp → Linked devices", and note that it is only needed once.
- Show `error` verbatim when present.
- A small form to send a test message (number + text).

**Message handling**
- Ignore `message.fromMe`, anything from `status@broadcast`, and group chats unless a
  `replyToGroups` flag is on.
- Ignore bodies shorter than 2 characters; cap the question length.
- Resolve the sender's number to an application user by matching the **last 10 digits** of the
  stored profile phone number, so country-code and formatting differences do not matter.
- Generate the reply from the app's existing RAG pipeline, scoped to that user's own vector
  namespace plus a shared namespace. Fall back to a privacy-safe per-number namespace when the
  sender is unknown, so they can ask general questions but never reach another user's documents.
- Reply with `message.reply(answer)` and increment a replied counter.

**Robustness**
- The embedded browser emits events from its own async context: a stray rejection must never take
  the API down. Register `process.on('unhandledRejection')` and `process.on('uncaughtException')`
  handlers that log and continue.
- Wrap every event handler body in try/catch and log failures.
- Make the whole feature non-fatal: if the library or a browser is missing, report it through
  `status.error` and let the API keep serving.

**Verification without a phone**
- Confirm `POST /start` returns `200` with `status: "qr"`, that `qrDataUrl` is a non-empty data
  URL, that the API still answers `/api/health` throughout, and that `POST /stop` returns
  `status: "stopped"`. Pairing itself needs a human to scan the code.

---

## 2. Answers worth reusing

- **Groq has no embeddings.** `/v1/embeddings` returns
  `"the model does not support embeddings"` for every model on the key. Use Groq for
  generation and a separate model for embeddings.
- **Crypto deposits land in the Funding wallet**, not Spot, so a portfolio built from
  `/api/v3/account` alone reads zero after a deposit. Futures lives on the `fapi` host.
- **A signed read can still be a POST.** Some Binance read endpoints (e.g.
  `/sapi/v3/asset/getUserAsset`) are POST-only; sign the form body the same way.
