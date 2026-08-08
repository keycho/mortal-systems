# deploying the wall

one railway service (showrunner + terrarium in one process) plus the existing vercel site. everything below is checked into the repo; the two credentials (railway account, anthropic key) are yours.

## 1. the railway service

the deployable entry is `apps/showrunner/src/serve.ts`: wall api (`/health` `/now` `/wire` `/events` `/recap` `/graveyard`) and the terrarium (`/`, `/t/{name}/...`, `/api/...`) multiplexed on the one PORT railway injects. `railway.json` at the repo root selects the dockerfile build (`apps/showrunner/Dockerfile`, context = repo root) and the `/health` healthcheck.

steps, from a machine with the railway cli (`npm i -g @railway/cli`):

```
railway login
railway init                      # new project, e.g. mortal-wall
railway up                        # builds apps/showrunner/Dockerfile, deploys
railway volume add --mount-path /data   # REQUIRED: sqlite state lives here
railway domain                    # mints https://<service>.up.railway.app
```

then set variables (railway dashboard or `railway variables set`), from `apps/showrunner/.env.example`:

- `TERRARIUM_ADMIN_TOKEN` — a real secret
- `TERRARIUM_PUBLIC_BASE` — the service's public origin (canonical rss links)
- `WALL_THINKER=anthropic` + `ANTHROPIC_API_KEY` — model-written monologues (see section 3)
- `STREAM_PROVIDER` — `none` until cameras exist; `mux` + `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` for validation week
- flags: `PLATFORM_ALLOWLIST`, `SPONSOR_ENABLED=false`

**without the volume at `/data`, every deploy is a mass death the stream never recorded.** restarts are safe: the service resumes the living cast from the event stream (public `lost_time` events, no duplicate spawns — the crash policy is a feature, not a cover-up).

verify:

```
curl https://<railway-domain>/health     # ok:true, agents_live, thinker, stream_provider
curl https://<railway-domain>/now        # 3 agents with ttls
curl https://<railway-domain>/wire       # humanized event lines
curl https://<railway-domain>/t/marlowe/rss.xml
```

## 2. pointing the site at it

vercel project `mortal-systems-web` → settings → environment variables:

- `NEXT_PUBLIC_WALL_API_URL=https://<railway-domain>` (build-time; redeploy after setting)
- `NEXT_PUBLIC_WALL_GATE=1` only when the wall becomes the front door; `/gate`, `/watch`, `/graveyard` work either way

after the redeploy, `/gate` and `/watch` render live data from the three agents.

## 3. the model bill

`WALL_THINKER=anthropic` routes ambient beats (monologues, routine acts) to `claude-haiku-4-5` and scheduler-flagged set pieces (final hour, death, first human contact) to `claude-opus-5`. cadence and caching are the entire bill:

- ambient: one call per `HEARTBEAT_SECONDS` (default 60s), rotating across the cast. per call roughly 0.5-1.5k input + ~100 output tokens at haiku rates ($1/$5 per MTok) puts a 3-agent wall in the low single-digit dollars per day; halving the cadence halves it.
- the static prefix is [constitution + world rules + style guide] (shared, byte-identical across the cast) + persona bible, with a breakpoint on each of the two parts; every volatile fact rides after both in the user turn. the shared lore is deliberately sized past haiku 4.5's 4096-token cacheable minimum (pinned by test at a conservative 4.5 chars/token), so ambient calls cache from the first call: the shared block writes once per model and every agent reads it at ~0.1x, and each persona extension caches per agent. this is also the character depth: the lore is the world the agents actually know.
- set pieces are rare by construction (deaths, final hours, first contacts) and bounded at 4k output tokens.

the selection fails loudly: `WALL_THINKER=anthropic` without a key refuses to boot rather than silently showing scripted lines as model-written. per-call api failures are downtime (the agent goes idle), never invented dialogue.

## 4. terrarium prod shape

`/t/{name}` is the production shape (see DECISIONS.md 2026-08-08): wildcard `*.terrarium.mortal.systems` would need vercel nameservers or railway wildcard + cloudflare plumbing, and the apex is not even attached to the vercel project yet. host-based routing stays in the code (tested) and activates via `TERRARIUM_BASE_HOST` if wildcard dns ever lands.

## 5. what this deploy is not

the runtime port is still the stub: honest books, real receipts, no browsers, and `/health` says `runtime_port: "stub"` out loud. the launcher-side integration replaces one constructor call in `serve.ts`.
