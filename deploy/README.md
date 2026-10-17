# Deployment

Everything the app needs to run in production lives here, and everything runs in
Docker. `/opt/nascon` on the server is the whole repository plus a `.env` that never
leaves the machine.

```
docker-compose.yml          the stack (at the repo root — that is where compose looks)
deploy/
├── .env.example            every variable the stack reads
├── docker/
│   ├── frontend.Dockerfile     Vite build → nginx, which also routes /api and /voice
│   ├── backend.Dockerfile      Express API
│   ├── ai.Dockerfile           Flask: embeddings, voice, audio queue worker
│   ├── chroma.Dockerfile       vector database, pinned to the client's version
│   └── frontend-nginx.conf     SPA fallback + reverse proxies
├── nginx/
│   └── nascon.artdevelopers.site.conf   host vhost (TLS + proxy to 127.0.0.1:8085)
└── scripts/
    └── bootstrap-vm.sh     Docker, app directory, vhost, certificate — idempotent
```

## Architecture

```
                    ┌─────────────────────────────── host nginx (443, certbot) ──┐
browser ──TLS──▶    │  nascon.artdevelopers.site → 127.0.0.1:8085                  │
                    └──────────────────────────────────────────────────────────────┘
                                              │
                                    frontend container (nginx)
                                    ├── /            → the SPA
                                    ├── /api/…       → backend:4000
                                    └── /voice/…     → ai:8100
                                              │
                    ┌─────────────────────────┴──────────────────────────┐
                    ▼                                                    ▼
              backend (Express)                                      ai (Flask)
              ├── chroma:8000                                        ├── chroma:8000
              ├── ai:8100 (embeddings)                               └── rabbitmq:5672
              └── Cloudinary, Groq, Binance
```

Only `frontend` publishes a port, and only on `127.0.0.1`. RabbitMQ, Chroma and the
API are reachable inside the compose network alone — no AMQP or database port is
exposed to the internet.

## Deploying

### First time on a host

```bash
git clone <repo> /root/nascon-src && cd /root/nascon-src

sudo DOMAIN=nascon.artdevelopers.site \
     CERTBOT_EMAIL=you@example.com \
     bash deploy/scripts/bootstrap-vm.sh

# it stops and tells you to fill in /opt/nascon/.env
$EDITOR /opt/nascon/.env
sudo bash deploy/scripts/bootstrap-vm.sh      # re-run: now it finishes
```

`bootstrap-vm.sh` installs Docker, creates `/opt/nascon`, installs the nginx vhost and
issues the certificate. It is safe to re-run and touches nothing else on the host.

### Bringing the stack up

```bash
cd /opt/nascon
docker compose --env-file .env up -d --build     # build on the host
docker compose --env-file .env ps
docker compose --env-file .env logs -f ai
```

### Through GitHub Actions (the normal path)

`.github/workflows/deploy.yml` builds all four images, pushes them to GHCR and then
tells the server to pull and restart. The server never builds.

Add these repository secrets:

| Secret | What it is |
| --- | --- |
| `VM_HOST` | the server's address |
| `VM_USER` | a user that can run docker |
| `VM_SSH_KEY` | that user's private key |
| `GHCR_TOKEN` | a PAT with `read:packages` so the server can pull private images (or make the packages public and skip it) |

`ci.yml` runs on every push and PR: frontend lint + build, backend syntax check and a
real boot of `/api/health`, the Python modules import and the VAD is exercised, and all
four images are built.

## The audio queue

Voice is the one part of the system that cannot run twice at once: two recordings
would fight over the same Groq quota and the same speaker. RabbitMQ is the
arbitrator.

- **One consumer, `prefetch_count=1`.** `ai` publishes each turn to `voice.audio` and
  consumes it itself with a single worker. The broker hands that worker one unacked
  message at a time, so a second upload waits in the queue instead of starting.
- **This is why `ai` must never be scaled.** A second replica would be a second
  consumer and the guarantee is gone. The service is deliberately not replicated.
- **Claim check.** A recording is ~450 KB base64-encoded, and pushing that through
  the broker cost 4.5 s of pickup latency on a 330 kbps uplink versus 0.3 s for a
  small message. So the audio is written to a spool file in the `ai-data` volume and
  only its id travels in the message. The spool is drained as jobs complete and swept
  on startup.
- **RPC replies.** The worker publishes the result back to the caller's exclusive
  reply queue, correlated by id, with a `RABBITMQ_JOB_TIMEOUT` ceiling.
- **It degrades safely.** No reachable broker → `enabled` is false and turns are
  processed inline behind a process-wide lock, which also guarantees no overlap.

Queue health is visible at `GET /voice/queue` (depth, in-flight, job counters, spool
file count) and is included in `/voice/health`.

To watch the broker:

```bash
ssh -L 15672:127.0.0.1:15672 root@<vm>    # then http://localhost:15672
```

## Environment

`deploy/.env.example` documents every variable. Compose reads it from
`/opt/nascon/.env`; the containers receive real environment variables, so nothing
depends on a `.env` file inside an image.

Two values are mandatory and compose refuses to start without them:
`JWT_SECRET` and `RABBITMQ_PASSWORD`. `GROQ_API_KEY` is required by the `ai` service.

Locally (`npm run embed` etc.) the backend reads `backend/.env` instead — see
`backend/.env.example`. The only difference is that `RABBITMQ_URL` points at whatever
broker you are using, and `CHROMA_AUTOSTART=true` lets the Python service own Chroma
as a child process.

## Operating it

```bash
cd /opt/nascon

docker compose --env-file .env ps                  # what is running
docker compose --env-file .env logs -f backend     # follow one service
docker compose --env-file .env restart ai          # bounce one service
docker compose --env-file .env down                # stop everything

# roll back to a previous build
IMAGE_TAG=<previous-sha> docker compose --env-file .env up -d
```

## Known constraints

- **`ai` is single-replica by design.** See above.
- **WhatsApp is off in containers.** It needs Chromium and a one-time QR scan per
  environment. `backend.Dockerfile` sets `PUPPETEER_SKIP_DOWNLOAD=true`; to enable it,
  install Chromium in the image, set `WHATSAPP_CHROME_PATH`, mount a session volume and
  set `WHATSAPP_ENABLED=true`.
- **Binance stays read-only.** The key must have "Enable Reading" only, with an IP
  allowlist. The code has no order, transfer or withdrawal path.
- **The certificate is issued by certbot** through an HTTP-01 webroot challenge, which
  works with Cloudflare proxying because Cloudflare passes `/.well-known/acme-challenge`
  through to the origin.
- **The host is shared.** Other sites are served by the same nginx; this vhost only adds
  one `server_name` and never modifies the others.
