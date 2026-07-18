# FreshMint Marketplace

Multi-chain (EVM + Solana) digital-art NFT marketplace whose differentiator is **deliberate attention allocation**: Emerging quotas, composed feed mixes, staged launches, and anti-congestion controls.

## Principles (enforced in code)

1. Homepage is a composed discovery product — not a global activity firehose
2. Emerging quota is enforced in the Rising ranker (`40%` reserved)
3. Anyone can list; not everyone gets the same attention
4. Congestion is managed with slot caps, decay, and diversity rules

## Quick start

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Core modules

| Module | Role |
|---|---|
| `src/lib/discovery/config.ts` | Locked quotas, feed mix, Emerging thresholds |
| `src/lib/discovery/emerging.ts` | Emerging eligibility |
| `src/lib/discovery/quotas.ts` | Rising / Featured / OE / auction slot budgets |
| `src/lib/discovery/scoring.ts` | Fairness-aware ranker |
| `src/lib/discovery/staging.ts` | Draft → Soft → Rising → Featured |
| `src/lib/discovery/anti-spam.ts` | Rate limits, duplicates, reports, appeals |
| `src/lib/discovery/feed-mix.ts` | Homepage 40/25/20/15 composition |
| `src/lib/discovery/metrics.ts` | Emerging share, entropy, spam rate, TTFV |
| `src/lib/discovery/engine.ts` | Orchestrates Phase 1 surfaces |

## API

- `GET /api/feed?viewerId=` — composed homepage
- `GET /api/rising` — Rising lane + Emerging share
- `GET /api/featured` — Featured lane
- `GET /api/open` — Open Lane filters (`chain`, `q`, `type`, …)
- `GET /api/metrics` — discovery health metrics
- `GET /api/shelves` — collector shelves
- `POST /api/report` — report / rapid delist
- `POST /api/listings/[id]/stage` — advance launch stage
