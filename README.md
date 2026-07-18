# FreshMint Marketplace

Multi-chain (EVM + Solana) digital-art NFT marketplace whose differentiator is **deliberate attention allocation**: Emerging quotas, composed feed mixes, staged launches, and anti-congestion controls.

## Quick start

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use **Demo persona** in the header (or Connect EVM wallet) → **Create** to soft-launch a work → Open Lane / Rising / metrics.

## What’s implemented

### Discovery core
- Emerging eligibility + **40% Rising quota**
- Homepage feed mix **40 / 25 / 20 / 15**
- Draft → Soft launch → Rising → Featured staging
- Anti-spam: rate limits, media-hash duplicates, reports/appeals, nominations

### Next-step platform layer
- **SQLite + Prisma** persistence for users, wallets, listings, shelves, signals, purchases
- **Wallet auth**: EVM `personal_sign` + Solana ed25519 verify; HTTP-only session cookies
- **Demo personas** for local cold-start without a browser extension
- **Create / soft-launch** flow with simulated Sepolia / Devnet mint refs
- **Phase 2 signals**: impressions, dwell/meaningful views, saves, nominations, purchases
- Cold-start seed: emerging artists, guest curator shelf, collector follows

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local app |
| `npm test` | Discovery unit tests |
| `npm run db:seed` | Reset cold-start catalog |
| `npm run db:studio` | Browse SQLite |

## API highlights

- `POST /api/auth/nonce` · `POST /api/auth/verify` · `POST /api/auth/demo`
- `POST /api/listings` · `POST /api/listings/:id/stage`
- `POST /api/signals` · `POST /api/nominate` · `POST /api/purchase`
- `GET /api/feed` · `/api/rising` · `/api/open` · `/api/metrics`

## Principles (enforced in code)

1. Homepage is a composed discovery product — not a global activity firehose  
2. Emerging quota is enforced in the Rising ranker  
3. Anyone can list; not everyone gets the same attention  
4. Congestion is managed with slot caps, decay, and diversity rules  
