# English auctions — soft settle (current) vs on-chain escrow (future)

FreshMint currently settles English auctions **off-chain** (soft settle):

- Bids and awards are recorded in Postgres.
- Winners get a payment window; cascade / expired flows emit in-app (+ optional email) notifications.
- Primary transfer still uses the existing crypto checkout / mint path.

**Deferred (not in this release):** full on-chain English auction contracts with escrowed bids.
That remains future work once Soft settle has more production volume and treasury ops are funded.
Mainnet treasury Safe/Squads deployment stays **parked**.
