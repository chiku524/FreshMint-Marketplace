# FreshMint Marketplace

Multi-chain (EVM + Solana) digital-art NFT marketplace whose differentiator is **deliberate attention allocation**: Emerging quotas, composed feed mixes, staged launches, and anti-congestion controls.

## Quick start

```bash
cp .env.example .env
docker compose up -d          # Postgres on localhost:5433
npm install
npx prisma migrate deploy     # or: npx prisma db push
npm run db:seed
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use **Demo persona** in the header (or Connect EVM wallet) → **Create** to soft-launch a work → Open Lane / Rising / metrics.

### Database / preview notes

- Primary store is **Postgres** via `DATABASE_URL` (local Docker maps **5433→5432**).
- Runtime **never** shells out to `npx prisma` (that crashes Vercel sandboxes).
- If Postgres is unset or unreachable → **in-memory seeded catalog**.
- Check `GET /api/health` for `{ mode: "prisma" | "memory", blobConfigured, evmMarket }`.

For hosted previews, set `DATABASE_URL` to a managed Postgres URL (Neon, Supabase, Vercel Postgres, etc.).

Step-by-step Vercel Blob + Neon/Prisma Postgres setup: [`docs/vercel-hosting.md`](docs/vercel-hosting.md).

Discovery system reference: [`docs/discovery.md`](docs/discovery.md) · live in-app: [`/docs`](https://fresh-mint-marketplace.vercel.app/docs).

### Object storage

- With `BLOB_READ_WRITE_TOKEN` (Vercel Blob) → uploads go to Blob CDN URLs.
- Without it → local `public/uploads` (fine for `npm run dev`).

### On-chain (Sepolia + Solana Devnet)

1. Deploy `contracts/FreshMintMarket.sol` (see `contracts/README.md`).
2. Set `NEXT_PUBLIC_EVM_MARKET_ADDRESS` + optional `EVM_MINTER_PRIVATE_KEY` / `EVM_RPC_URL`.
3. Solana Devnet memos: optional `SOLANA_MINTER_SECRET_KEY` (JSON byte array) or sign from Phantom via `/api/onchain/prepare`.

Without a market address, EVM stays **simulated**. With it, create/buy returns `walletTx` for MetaMask / Phantom, or submits via the server key when configured.

## What’s implemented

### Discovery core
- Emerging eligibility + **40% Rising quota**
- Homepage feed mix **40 / 25 / 20 / 15**
- Draft → Soft launch → Rising → Featured staging
- Anti-spam: rate limits, media-hash duplicates, reports/appeals, nominations

### Platform layer
- **Postgres + Prisma** persistence (memory fallback)
- **Wallet auth**: EVM `personal_sign` + Solana ed25519 verify; HTTP-only session cookies
- **Cross-chain wallet linking** via `/api/auth/link-wallet`
- **Demo personas** for local cold-start without a browser extension
- **Create / soft-launch** with Sepolia / Devnet mint intents + optional live wallet txs
- **Phase 2 signals**: impressions, dwell/meaningful views, saves, nominations, purchases
- Cold-start seed: emerging artists, guest curator shelf, collector follows

### Integrity & ops
- **Sybil-lite** signal rate limits, new-account caps, self-engagement block, wash-purchase detection
- **OE / auction calendar** with hourly start caps + Rising concurrency limits (`/calendar`)
- **Moderation queue** for reports & appeals (`/moderate` — demo as Ops Moderator)
- **Studio** for Featured editorial controls + collector shelf creation (`/studio`)

### Media & chains
- **Media upload** via `POST /api/media/upload` → Vercel Blob or local disk
- **On-chain intents** in `src/lib/onchain/*` + `POST /api/onchain/prepare`

## Scripts

| Command | Purpose |
|---|---|
| `docker compose up -d` | Local Postgres (:5433) |
| `npm run dev` | Local app |
| `npm test` | Discovery unit tests |
| `npm run db:seed` | Reset cold-start catalog |
| `npm run db:studio` | Browse Postgres |

## API highlights

- `POST /api/auth/nonce` · `POST /api/auth/verify` · `POST /api/auth/demo`
- `POST /api/listings` · `POST /api/listings/:id/stage`
- `POST /api/signals` · `POST /api/nominate` · `POST /api/purchase`
- `POST /api/media/upload` · `POST /api/onchain/prepare` · `POST /api/onchain/confirm`
- `POST /api/follow` · listing detail `/listings/:id` · creator `/creators/:id`
- `GET /api/feed` · `/api/rising` · `/api/open` · `/api/metrics` · `/api/health`

## Principles (enforced in code)

1. Homepage is a composed discovery product — not a global activity firehose  
2. Emerging quota is enforced in the Rising ranker  
3. Anyone can list; not everyone gets the same attention  
4. Congestion is managed with slot caps, decay, and diversity rules  
