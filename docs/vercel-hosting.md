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
| `DATABASE_URL` | Postgres (without it → memory mode) | Prisma Postgres Marketplace store `freshmint-db` (or Neon) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob uploads | Connect `freshmint-media` store to the project in the UI |
| `AUTH_SECRET` | Session JWT signing | Set for Production + Preview |
| `ALLOW_DEMO_AUTH` | Demo personas on preview | Set `true` for Production + Preview |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth on `/sign-in` | Google Cloud OAuth client; see below |
| `NEXT_PUBLIC_APP_URL` | Canonical public origin for OAuth redirects | `https://fresh-mint-marketplace.vercel.app` (or custom domain) |
| `NEXT_PUBLIC_EVM_MARKET_ADDRESS` | Optional live Sepolia market | Optional |

### Google OAuth (production)

1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Web).
2. Authorized JavaScript origins: `https://fresh-mint-marketplace.vercel.app`
3. Authorized redirect URI (exact):
   `https://fresh-mint-marketplace.vercel.app/api/auth/google/callback`
4. Put the client id/secret in Vercel env for Production (+ Preview if you also whitelist preview URLs).
5. Runtime persists users via Prisma. On Prisma Postgres, the app uses `@prisma/adapter-ppg` so serverless traffic does not burn the tiny direct TCP/`prisma_migration` connection budget (that previously surfaced as `Google sign-in failed`).

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
