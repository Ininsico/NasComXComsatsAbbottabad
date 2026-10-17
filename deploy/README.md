# Deployment

Everything runs in Docker, and every deploy goes through GitHub Actions. There is no
registry hop, no `scp`, and no SSH in the pipeline: the workflow runs on a self-hosted
runner **on the deployment host itself**, so it builds the images there and restarts the
stack in place.

- Live site: <https://nascon.artdevelopers.site>
- Server: `169.58.119.44`, repository checked out at `/opt/nascon`
- Deployment UI: <https://nascon.artdevelopers.site/deploy> (also takes over the screen
  while a deploy is running)

## Layout

```
docker-compose.yml              the stack — at the repo root, so `context: .` is the root
deploy/
├── .env.example                every variable the stack reads
├── docker/
│   ├── frontend.Dockerfile         Vite build → nginx, which also routes /api and /voice
│   ├── backend.Dockerfile          Express API + Chromium for the WhatsApp bridge
│   ├── ai.Dockerfile               Flask: embeddings, voice, audio queue worker
│   ├── chroma.Dockerfile           vector database, pinned to the backend client's version
│   └── frontend-nginx.conf         SPA fallback + reverse proxies
├── prometheus/
│   ├── prometheus.yml            what gets scraped
│   └── alerts.yml                eight alerting rules (API, Redis, errors, host, deploys)
├── grafana/
│   ├── build-dashboards.py       generates the dashboards from a compact spec
│   ├── provisioning/             datasource + dashboard provider, applied on boot
│   └── dashboards/*.json         four generated dashboards (34 panels)
├── nginx/
│   └── nascon.artdevelopers.site.conf    host vhost: TLS + proxy to 127.0.0.1:8085
└── scripts/
    ├── bootstrap-vm.sh         Docker, app directory, vhost, certificate — idempotent
    ├── install-runner.sh       adds self-hosted runners for Actions
    ├── announce.sh             reports deploy progress to the site
    ├── snapshot-containers.sh  reports per-container health to the site
    └── authorize-deploy-key.sh optional: gives a human key-based SSH access
```

## Architecture

```
                    ┌────────────────────────── host nginx (443, certbot) ──┐
browser ──TLS──▶    │  nascon.artdevelopers.site → 127.0.0.1:8085            │
                    └────────────────────────────────────────────────────────┘
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
              ├── ai:8100 (embeddings, voice)                        ├── rabbitmq:5672
              ├── redis:6379                                         └── redis:6379
              └── Cloudinary, Groq, Binance
```

Only `frontend` publishes a port, and only on `127.0.0.1`. RabbitMQ, Chroma and the API
are reachable inside the compose network alone — no AMQP or database port faces the
internet.

## First-time setup on a host

```bash
git clone https://github.com/Ininsico/NasComXComsatsAbbottabad.git /root/nascon-src
cd /root/nascon-src

sudo DOMAIN=nascon.artdevelopers.site \
     CERTBOT_EMAIL=you@example.com \
     bash deploy/scripts/bootstrap-vm.sh

# it stops and asks for the secrets
sudo -e /opt/nascon/.env
sudo bash deploy/scripts/bootstrap-vm.sh      # re-run: now it finishes
```

`bootstrap-vm.sh` installs Docker, creates `/opt/nascon`, installs the nginx vhost and
issues the certificate. It is idempotent and touches nothing else on the host.

Then install the runners (see below), and the next push to `main` deploys.

### Runners

This account is **refused GitHub-hosted runners**. Every job — including one whose only
step is `uname -a` — is aborted after about two seconds with `runner_id: 0`, zero steps
and no log, on every workflow, while GitHub reports Actions fully operational. That is
an account-level block, not something a workflow file can fix.

Self-hosted runners are unaffected, so this host runs three of them, all labelled
`nascon`:

| Runner | Directory |
| --- | --- |
| `nascon-vm` | `/opt/actions-runner` |
| `nascon-vm-2` | `/opt/actions-runner-2` |
| `nascon-vm-3` | `/opt/actions-runner-3` |

They run as root because the deploy needs Docker, and each is a systemd service:

```bash
systemctl list-units 'actions.runner.*'
systemctl restart actions.runner.Ininsico-NasComXComsatsAbbottabad.nascon-vm-2.service

# add another
TOKEN=$(gh api -X POST repos/Ininsico/NasComXComsatsAbbottabad/actions/runners/registration-token --jq .token)
sudo GH_RUNNER_TOKEN="$TOKEN" bash deploy/scripts/install-runner.sh nascon-vm-4
```

More runners means CI's jobs run in parallel; it does **not** parallelise deploys, which
are serialised by the workflow's concurrency group.

## How a deploy works

Push to `main` (or run the workflow manually):

```
actions/checkout
  ↓
check /opt/nascon/.env exists          → announce "preparing"
  ↓
                                       → announce "announced"
docker compose build                   → announce "building"     (15%)
  ↓
docker compose up -d                   → announce "rolling"      (70%)
  ↓
wait for every container to be healthy → announce "health"       (82%)
   every 5s: snapshot containers + announce, so rows go green as each one comes up
  ↓
verify through the public domain       → announce "verifying"    (92%)
   SPA serves #root, /api/health ok, /voice/health ok (STT configured, queue worker alive)
  ↓
                                       → announce "done"         (100%)
```

If anything fails, the last step reports `failed` instead, so the page never claims a
broken deploy succeeded.

- **Concurrency:** `group: deploy-production` means exactly one deploy runs at a time,
  even with three runners. Two `docker compose up -d` calls would otherwise fight.
- **Images** are tagged with the commit (`IMAGE_TAG=<sha>`), so a rollback is just a
  different tag.
- **Layer caching** is why this is quick: the runner is the production host, so the
  build cache is already there.

### The progress UI

`GET /api/deploy/status` is public and returns the current stage, a percentage, the
commit, and a row per container. `POST` accepts updates and only exists when
`DEPLOY_STATUS_TOKEN` is set — the pipeline reads that token from `/opt/nascon/.env`, so
a normal local checkout has no writable endpoint.

While a deploy is running, a panel covers the screen (z-index above the site header)
with the bar, the stage list and one row per container. `/deploy` renders the same panel
on its own page at any time. A notice older than 30 minutes is ignored, so a killed
deploy cannot pin the site in "deploying" forever; `DELETE /api/deploy/status` clears it
by hand.

## What persists

Every deploy recreates containers but keeps these named volumes:

| Volume | Mount | Holds |
| --- | --- | --- |
| `nascon_chroma-data` | `/data` (chroma) | the vector database — collections survive deploys |
| `nascon_backend-data` | `/app/data` (backend) | `users.json`, `documents.json`, `profiles.json`, `deploy-status.json`, **`whatsapp-session/`** |
| `nascon_ai-data` | `/app/data` (ai) | embedding model cache, audio spool, local vector fallback |
| `nascon_rabbitmq-data` | `/var/lib/rabbitmq` | queue state |
| `nascon_redis-data` | `/data` (redis) | the append-only file, so keys survive a restart |

`docker compose down` keeps them; `down -v` destroys them (and you would lose the
WhatsApp link and every stored document — don't).

### WhatsApp survives

The bridge runs Chromium **in the container**, and its linked session lives in the
`backend-data` volume, so a deploy never asks for a QR scan again.

- Chromium comes from the image (`/usr/bin/chromium`), not from puppeteer's download.
- `WHATSAPP_CHROME_PATH=/usr/bin/chromium`.
- The session is `whatsapp-session/session-comsats-portal`, with
  `whatsapp-session/.linked.json` recording the linked number.
- **Chromium's `SingletonLock` is cleared before every launch.** It names the host and
  pid that created it, and a recreated container has a different hostname — without
  clearing it Chromium refuses to start and the client dies silently.
- `WHATSAPP_ENABLED` can stay `false`: the client starts automatically whenever a linked
  session is present.

The client logs `[whatsapp] connected as 923278593583@c.us` when it is up. To move a
session to another machine, copy only `session-comsats-portal/Default/{IndexedDB,
Local Storage, Network, WebStorage, Preferences}` plus `.linked.json` — about 3 MB.
The other ~175 MB is Chromium cache and is recreated on first load.

## The audio queue

Voice is the one part that cannot run twice at once: two recordings would fight over the
same Groq quota and the same speaker. RabbitMQ arbitrates.

- **One consumer, `prefetch_count=1`.** `ai` publishes each turn to `voice.audio` and
  consumes it with a single worker. The broker hands that worker one unacked message at
  a time, so a second upload waits instead of starting.
- **`ai` must never be scaled.** A second replica would be a second consumer and the
  guarantee disappears. It is deliberately not replicated anywhere.
- **Claim check.** A recording is ~450 KB base64-encoded, and pushing that through a
  remote broker cost 4.5 s of pickup latency on a 330 kbps uplink against 0.3 s for a
  small message. The audio goes to a spool file in `ai-data` and only its id travels in
  the message; the spool drains as jobs complete and is swept on startup. On this host,
  with the broker on loopback, queue wait measures **3–5 ms**.
- **RPC replies** go to the caller's exclusive reply queue, correlated by id, capped by
  `RABBITMQ_JOB_TIMEOUT`.
- **It degrades safely.** With no reachable broker, `enabled` is false and turns run
  inline behind a process-wide lock, which also prevents overlap.

Inspect it at `GET /voice/queue` (depth, in-flight, counters, spool files), also
included in `/voice/health`. The management UI is not published — tunnel it:

```bash
ssh -L 15672:127.0.0.1:15672 root@169.58.119.44    # then http://localhost:15672
```

## Redis

`redis:7-alpine`, on the compose network as **`redis:6379`** and not published to the
host. Append-only persistence (`--appendfsync everysec`) and `maxmemory-policy
noeviction`, so keys survive a restart and Redis refuses a write rather than silently
dropping one. If it only ever holds disposable cache data, `allkeys-lru` is the better
policy — that is the one setting worth revisiting.

It is wired but deliberately unused: `REDIS_URL` reaches both the API and the AI
service, and nothing reads it until you ask for it. Leaving `REDIS_URL` unset disables
Redis completely.

Using it from an API route — this is what a page will need:

```js
import { withCache, cacheGet, cacheSet, cacheDel } from '../lib/redis.js';

// 30-second cache around something expensive
const { value, cached } = await withCache('dashboard:stats', 30, loadStats);

await cacheSet('session:abc', { userId: '…' }, 3600);
const session = await cacheGet('session:abc');
await cacheDel('session:abc');
```

Every helper degrades: no URL, a dead Redis or a blip returns null/false and calls the
loader rather than failing the request. `GET /api/health` reports
`redis: { configured, reachable }`, so its state is checkable from outside the host.

Inspect it:

```bash
docker exec -it nascon-redis-1 redis-cli
docker exec nascon-redis-1 redis-cli info keyspace
docker compose --env-file .env restart redis
```

## Observability

Prometheus scrapes; Grafana draws. Both live on the compose network with no published
ports, and nothing but Grafana's own login page is reachable from outside.

- **Prometheus** scrapes five jobs: the API's `/metrics`, `node-exporter` (host CPU,
  memory, disk, network), `cAdvisor` (per-container CPU and memory), `redis-exporter`,
  and itself.
- **The API's metrics** are produced by `backend/src/lib/metrics.js` with no dependency:
  request counts per method/route/status, and a latency **histogram** rather than an
  average, so `histogram_quantile` gives a real p95. Routes are the matched patterns
  (`/api/documents/:id`), never concrete URLs, so cardinality stays bounded.
- **Grafana** is at **<https://nascon.artdevelopers.site/grafana/>** — the frontend
  nginx proxies `/grafana/` to it, so it needs no extra hostname or certificate. Sign in
  with `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`; anonymous access and sign-ups are
  off. The admin console has a Grafana button that opens it.
- **The dashboards** are provisioned from `deploy/grafana/dashboards/` into the **NASCON**
  folder, with the first set as the home dashboard:

  | Dashboard | What it answers |
  | --- | --- |
  | Platform overview | Is it healthy right now? Requests, p95, errors, host, deploys, firing alerts. |
  | API detail | Which route is slow or failing? Rate by route/status/method, p50/p95/p99, slowest routes. |
  | Infrastructure | Host CPU, load, memory, disk, network, uptime, and per-container CPU/memory. |
  | Data and releases | Redis throughput, memory, clients, hit/miss ratio, evictions, plus deploy progress. |

  They are generated, not hand-edited: `deploy/grafana/build-dashboards.py` holds a
  compact spec and writes the JSON. Adding a panel is one line there, then run
  `python deploy/grafana/build-dashboards.py`. Grafana reloads the files every 30s.
- **Alerts** are Prometheus rules in `deploy/prometheus/alerts.yml`: API down, Redis down,
  an exporter down, error rate above 5%, p95 above 2s, host memory above 90%, disk above
  85%, and a deploy stuck for 30 minutes. They evaluate in Prometheus (visible at
  `/alerts` and in the overview dashboard's "Firing alerts" tile). Grafana has no
  delivery channel configured — add a contact point under Alerting once you have an
  email or webhook to send to.
- **Deploy state is a metric**: `nascon_deploy_in_progress` and `nascon_deploy_percent`
  are exported by the API, so releases show up on the same charts as traffic.
- Metric data is kept for 15 days in the `prometheus-data` volume.

To chart something new: record it through `increment()` / `observe()` in
`backend/src/lib/metrics.js`, and the scrape picks it up with no configuration. Then add
the PromQL to the dashboard JSON.

Inspect the stack directly. Neither Prometheus nor `/metrics` is published to the host,
so these run inside the containers:

```bash
# scrape targets and their health
docker exec nascon-prometheus-1 wget -qO- http://127.0.0.1:9090/api/v1/targets | head -c 600

# what the API exposes
docker exec nascon-backend-1 node -e "fetch('http://127.0.0.1:4000/metrics').then(r => r.text()).then(t => console.log(t.slice(0, 700)))"

# Grafana is the only public piece, behind its own login
curl -sI https://nascon.artdevelopers.site/grafana/ | head -3
```

## Load tests

k6 scripts in `deploy/loadtest/` that go through nginx to the real stack — no mocks.
`smoke.js` walks every feature once and asserts what each endpoint returns (public pages,
student and admin auth, documents, payments, retrieval, a real Groq answer, voice health
and a real TTS call, and that `/metrics` is *not* public). `load.js` is a weighted mixed
workload with p95 and error thresholds.

```bash
bash deploy/scripts/install-k6.sh
k6 run deploy/loadtest/smoke.js
k6 run -e VUS=25 deploy/loadtest/load.js
gh workflow run loadtest.yml -f profile=smoke
```

They default to `http://127.0.0.1:8085` so the load goes through the same path a browser
takes without Cloudflare in the way. Groq calls are excluded from the load profile unless
`-e INCLUDE_AI=1`. Uploads, profile writes and payment intents are not load-tested —
they mutate state or cost money. Full detail: [loadtest/README.md](loadtest/README.md).

## Environment and secrets

`deploy/.env.example` documents every variable. Compose reads `/opt/nascon/.env`; the
containers receive real environment variables, so nothing depends on a `.env` file
inside an image, and nothing secret is ever committed or passed through CI.

Required: `JWT_SECRET` and `RABBITMQ_PASSWORD` (compose refuses to start without them),
`GROQ_API_KEY` (the `ai` service), `DEPLOY_STATUS_TOKEN` (progress reporting).

Repository secrets (`VM_HOST`, `VM_USER`, `VM_SSH_KEY`, `GHCR_TOKEN`) are **no longer
used** by the pipeline; they can be deleted. Local development reads `backend/.env`
instead — see `backend/.env.example`.

## Operating it

```bash
cd /opt/nascon

docker compose --env-file .env ps                     # what is running
docker compose --env-file .env logs -f backend        # follow one service
docker compose --env-file .env restart ai             # bounce one service
docker compose --env-file .env down                   # stop (volumes are kept)

# roll back to a previous build
IMAGE_TAG=<previous-sha> docker compose --env-file .env up -d

# deploy by hand, without Actions
docker compose --env-file .env build && docker compose --env-file .env up -d
```

## Troubleshooting

Every entry here is something that actually happened on this host.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every workflow job fails in ~2 s, `runner_id: 0`, no steps | Account blocked from GitHub-hosted runners | Use the self-hosted runners |
| `RAG: semantic embeddings unavailable — falling back` | Backend indexed before `ai` was listening; the store decides once and keeps the fallback | `depends_on: ai: service_healthy`, and `seedCampusKnowledge` now waits for the service |
| `[chromium] <defunct>` and no WhatsApp line | `SingletonLock` from the old container's hostname | Cleared before launch in `whatsapp.js` |
| Deploy verification fails with 502 on `/voice/health` | It checked seconds after the container was created, while the model was still loading | The pipeline waits for every container to report healthy first |
| `nginx: host not found in upstream "backend"` | nginx resolves upstreams at startup | Upstreams are resolved at request time via Docker's resolver |
| Deploys crawl | CI and the deploy built the same four images at once on the same machine | CI builds images on pull requests only |
| The site says "deploying" with nothing running | A deploy died before clearing the notice | It expires after 30 minutes, or `DELETE /api/deploy/status` |
| `git push` denied for the account | The authenticated account lacks push access | Use an SSH key registered on an account with access |

## Constraints

- **`ai` is single-replica by design** — see the audio queue.
- **Binance stays read-only.** The key must have "Enable Reading" only plus an IP
  allowlist; the code has no order, transfer or withdrawal path.
- **The certificate is certbot's**, issued through an HTTP-01 webroot challenge. That
  works with Cloudflare proxying because Cloudflare passes
  `/.well-known/acme-challenge` through to the origin.
- **The host is shared.** Other sites are served by the same nginx; this vhost only adds
  one `server_name` and never modifies the others.
- **A cold deploy takes about a minute longer** than a warm one, because the backend now
  waits for the AI service to be healthy before it starts.
