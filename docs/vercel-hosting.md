# Vercel hosting: Postgres + Blob

FreshMint is already deployed as **fresh-mint-marketplace** under the `nico-builds` team.

Local link (already created under `.vercel/`, gitignored):

- Project: `prj_C1UVV1qHwt2c4aEw3zIXvaZCD0TQ`
- Org: `team_67ImRHJBPIr1iNCmSx4zR0VK`

## 1. Blob storage (created)

Blob store **freshmint-media** (`store_dosX1pOx9lVx9rHq`, region `iad1`) exists.

Connect it to the project and sync env vars:

1. Open [Vercel Storage → freshmint-media](https://vercel.com/nico-builds/~/stores/blob/store_dosX1pOx9lVx9rHq)
2. Click **Connect Project** → `fresh-mint-marketplace` (Production + Preview)
3. Confirm `BLOB_READ_WRITE_TOKEN` appears under Project → Settings → Environment Variables

Or from CLI after connecting in the UI:

```bash
vercel env pull .env.vercel --scope nico-builds
# copy BLOB_READ_WRITE_TOKEN into local .env if desired
```

## 2. Hosted Postgres (Neon)

Marketplace install requires accepting Neon terms once in the dashboard:

```bash
vercel integration add neon --scope nico-builds --name freshmint-pg -m region=iad1 -m auth=false
```

If prompted, open the dashboard, accept terms, re-run the command.

That should inject `DATABASE_URL` (and related Neon vars) into the project.

Then run migrations against the hosted DB:

```bash
vercel env pull .env.vercel --scope nico-builds
export $(grep -E '^DATABASE_URL=' .env.vercel | xargs)   # bash
npx prisma migrate deploy
npm run db:seed   # optional cold-start catalog
```

## 3. Required env checklist

| Variable | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | Postgres (without it → memory mode) | Accept Neon/Prisma terms in dashboard, then re-run `vercel integration add` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob uploads | Connect `freshmint-media` store to the project in the UI |
| `AUTH_SECRET` | Session JWT signing | Set for Production + Preview |
| `ALLOW_DEMO_AUTH` | Demo personas on preview | Set `true` for Production + Preview |
| `NEXT_PUBLIC_EVM_MARKET_ADDRESS` | Optional live Sepolia market | Optional |

Prisma Postgres install (after accepting terms in the dashboard that the CLI opens):

```bash
vercel integration add prisma/prisma-postgres --scope nico-builds --name freshmint-db -m region=iad1 --plan free
```

## 4. Redeploy

```bash
vercel --prod --scope nico-builds
# or push to GitHub if the project is git-connected
```

Verify: `GET https://fresh-mint-marketplace.vercel.app/api/health`  
Expect `{ "mode": "prisma", "blobConfigured": true, ... }` once both stores are connected.

## Rate limiting (Upstash Redis)

API rate limits live in `src/lib/http/rate-limit.ts`. When Upstash Redis credentials are
present (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or the `KV_REST_API_URL` +
`KV_REST_API_TOKEN` pair Vercel Marketplace injects) limits are shared across all serverless
instances via `@upstash/ratelimit` (sliding window). Without them, or if Redis errors, a
per-process in-memory limiter is used.

Setup: Vercel ? Storage / Marketplace ? **Upstash for Redis** (free plan) ? create a database ?
**Connect Project** ? `fresh-mint-marketplace` (all environments). Redeploy.

| Route | Key | Limit |
| --- | --- | --- |
| `POST /api/auth/login`, `/credentials`, `/2fa/*` | IP | 10 / 15 min |
| `POST /api/auth/register` | IP | 5 / hour |
| `POST /api/auth/nonce` | IP | 30 / 5 min |
| `POST /api/auth/verify` | IP | 20 / 5 min |
| `POST /api/purchase` | user | 20 / min |
| `POST /api/listings/[id]/bids` | user | 30 / min |
| `POST /api/report` | user | 10 / hour |
| `POST /api/signals` | user or IP | 300 / min |
| `POST /api/media/upload` | user | 60 / 10 min |

Exceeding a limit returns `429 { error: "rate_limited", retryAfterSec }` with a `Retry-After` header.