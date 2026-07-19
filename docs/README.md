# FreshMint docs

Internal and product references for how FreshMint allocates attention.

| Doc | Audience | Contents |
|---|---|---|
| [discovery.md](./discovery.md) | Product, eng, ops | Discovery surfaces, stages, Emerging rules, scoring, congestion |
| [onchain.md](./onchain.md) | Eng / product | Multi-chain ERC-721 + Metaplex mints, Relay native bridge |
| [vercel-hosting.md](./vercel-hosting.md) | Eng / deploy | Postgres, Blob, env vars on Vercel |

**Live (in-app):** collectors and creators can read the same discovery rules at [`/docs`](/docs) — values are loaded from `DISCOVERY_CONFIG` so they match production code.
