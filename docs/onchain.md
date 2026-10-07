# Multi-chain minting & native bridge

FreshMint settles art on the same networks it can fund via the bridge.

## Networks

| Network id | VM     | Native | Testnet (default)   | Mainnet (when funded) |
|------------|--------|--------|---------------------|------------------------|
| ethereum   | EVM    | ETH    | Sepolia             | Ethereum               |
| base       | EVM    | ETH    | Base Sepolia        | Base                   |
| arbitrum   | EVM    | ETH    | Arbitrum Sepolia    | Arbitrum One           |
| optimism   | EVM    | ETH    | OP Sepolia          | Optimism               |
| solana     | Solana | SOL    | Devnet              | Mainnet                |
| boing      | Boing  | BOING  | Testnet (chain 6913)| Not on Relay           |

Set `NEXT_PUBLIC_CHAIN_MODE=testnet` (default) or `mainnet`.

**Boing is a native L1**, not an EVM chain. Do not add it via MetaMask `wallet_addEthereumChain`. Use [Boing Express](https://boing.express) (`window.boing`) and 32-byte account ids (`0x` + 64 hex). Public RPC: `https://testnet-rpc.boing.network/` (Cloudflare Worker). Explorer: `https://boing.observer`. Boing is **not** on Relay — `/bridge` excludes it.

Server-side reads (`boing_getBalance`, NFT owner checks) send `User-Agent: FreshMintMarketplace/boing-rpc` and automatically fall back to Fly origins (`boing-testnet-1.fly.dev`, `boing-testnet-2.fly.dev`) when the public edge returns Cloudflare HTTP 403. On Vercel, set `BOING_RPC_URL` to a reachable node (often a Fly URL) if the public gateway still blocks your region.

## Collection deploy + mint at publish

Creates stay on FreshMint; **primary buys are crypto-only** with ownership at purchase. On-chain work happens in two **creator-paid** phases, then a collector-paid settlement:

1. **Create collection** — creator wallet deploys a per-collection contract (`FreshMintERC721` on EVM; Boing `contract_deploy_meta`; Solana collection attestation). Store `contractAddress` / `deployTxHash` on the collection. Studio and Create surface this as the **deploy** step; Boing mint retries only force a re-deploy when the contract AccountId is actually missing on-chain.
2. **Soft-launch / publish** — creator wallet mints tokens **into that collection** (EVM `safeMintBatch` in chunks of 25). Each listing gets `tokenId` + `mintTxHash`. Soft-launch is **blocked** until mint confirms (`listing_not_minted`). Unminted listings cannot be bought. Track incomplete work in `/studio`.
3. **Buy** — collector pays native on the listing network (or bridges via Relay when paying from another Relay network), then escrow `transferFrom` → buyer wallet. Purchase status: `pending_payment` → `pending_transfer` → `completed` (with `withdrawnAt` set when ownership is delivered). Interrupted buys can be resumed from `/me` via `POST /api/purchase/resume`.

| Step | On-chain | Who pays gas |
|------|----------|--------------|
| Create collection | Deploy contract | Creator |
| Publish / soft-launch | Batch mint into collection | Creator |
| Buy (same-chain) | Pay native + NFT transfer | Collector |
| Buy (cross-chain) | Relay bridge + NFT transfer on listing chain | Collector |
| Withdraw | Legacy USD holds only | Collector |

**Withdraw is not mint.** Mint happens at publish (step 2). Crypto buys transfer that NFT at purchase (step 3). Withdraw remains only for older USD holds that never settled on-chain. The `withdrawnAt` purchase field means ownership was delivered — not that a mint ran.

**Cross-chain:** Relay covers EVM natives ↔ Solana (e.g. pay ETH for a Solana NFT). **Boing is not on Relay** — Boing listings are same-chain BOING only.

- **EVM:** Deploy bytecode from `src/lib/onchain/evm-artifacts/freshMintErc721Bytecode.ts`. Mint URI should point at media (Blob URL). Settlement prefers escrow `transferFrom` over listing `buy()`.
- **Solana:** Metaplex Core asset per piece at publish; Phantom signs (or server key on Devnet for legacy paths only).
- **Boing:** Collection deploy via `contract_deploy_meta` with pinned reference NFT bytecode; mints use `contract_call` when a collection address exists.
- Confirm deploy: `POST /api/collections/[id]/deploy`. Confirm mint batches: `POST /api/collections/[id]/mint`.
- Buy: `POST /api/purchase` (crypto fields), confirm steps: `POST /api/purchase/confirm`, quote: `POST /api/purchase/quote`.

## Platform fees (all FreshMint NFT sales)

Every NFT sale that settles on FreshMint takes a **0.5%** treasury fee from the
sale amount (buyer still pays the listed / bid / offer / package price):

| Share | BPS | Recipient |
|-------|-----|-----------|
| 0.5%  | 50  | Marketplace treasury — community, events, and future updates (EVM + Solana settlement addresses; BTC recorded for ops) |
| 99.5% | —   | Seller |

Covered services: **buy now**, **timed listing**, **English auction**, **Dutch auction**, **accepted offers**, **collection packages**, **resale** (resale also deducts creator royalty). Creator mint/deploy gas is network gas, not this fee. Featured boost remains a separate **$15 USD** promotional payment to the same treasury.

### Friday treasury buys

Every **Friday 16:15 UTC**, Vercel Cron hits `GET /api/cron/friday-treasury-buy` (`CRON_SECRET`). Budget is **last week’s treasury profit** (0.5% sale fees + Featured boosts). If that profit is positive and the listing-chain treasury native balance covers a live Open Lane buy-now work (not the treasury’s own listings, not auctions/open editions), the job records that Friday’s window (`TreasuryFridayBuy.windowId` = UTC date) and:

1. **Signer present** (`TREASURY_EVM_SIGNER_PRIVATE_KEY` / `TREASURY_SOLANA_SIGNER_SECRET_KEY` whose address matches the public treasury or operator): pays native via the existing settlement address, then `purchaseListing` (same path as collectors). NFT transfer may still be `pending_transfer` until escrow is signed.
2. **No matching signer** (typical: EVM Safe / Solana Squads): **queued intent only** — does not reserve the listing. Fully automated on-chain spend is blocked until a hot wallet that *is* the treasury/operator, or a Safe/Squads execution path, exists.

Spend cap: **that UTC week’s treasury profit** — sum of `Purchase.feeTreasuryUsd` (0.5% of settled sales) plus `$15` per Featured boost in the window (previous Friday 00:00 UTC through this Friday). Skip when profit is 0. Optional `TREASURY_FRIDAY_BUDGET_USD` is a ceiling on that profit, not a default. Selection: SHA-256(`windowId` + `listingId`) among eligible minted listings. Native check is list-price quote + gas reserve (0.001 ETH on Ethereum, 0.0001 ETH on Base/Arbitrum/Optimism, 0.001 SOL). Idempotent per Friday.

Collectors see the policy on home, Open Lane, listing (buy-now), collection pages, and `/docs#fees`.

Generate keys locally (secrets stay in gitignored `.wallets/`):

```bash
npm run wallets:create
# after funding owner #1 / a Solana payer:
npm run wallets:deploy-safe
npm run wallets:deploy-squads
```

Env: `NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS`, `NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA`, `NEXT_PUBLIC_PLATFORM_TREASURY_BTC`, `NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS`, `NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA`.

Platform sales record the 0.5% split on each `Purchase` row. Checkout settles in listing-chain native (fee taken in that currency when possible). The optional EVM `FreshMintERC721.buy` path still exists for direct on-chain checkout (0.5% on-chain to treasury); marketplace settlement uses pay-to-platform + escrow transfer so price can stay USD-labeled while payment is native-quoted.

## Featured boost

Creators can pay a fixed **$15 USD** promotional fee (native-quoted) to activate Featured placement for a listing. Payment goes to the same public treasury addresses as primary sale fees (`NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS` / `NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA`). Rising / Open Lane scoring is never affected.

- Prepare: `POST /api/listings/[id]/boost` with `{ payNetwork, fromAddress }` → returns `walletTx` + quote
- Confirm: `POST /api/listings/[id]/boost/confirm` with `{ payNetwork, txHash }` → sets `featuredBoostedAt` after hash validation
- Set `FEATURED_BOOST_REQUIRE_CONFIRM=true` in production so soft-accept of unverified hashes is off (live on Vercel)
- UI: `FeaturedBoostButton` on the listing page (owner only)

### Platform treasury addresses

| Chain | Address | Used by settlement |
|-------|---------|--------------------|
| EVM | `0xDde8Ec0A27467a8Eb6E7a3245e07d2D67B6B56bb` | Yes (`NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS`) |
| Solana | `3u2DbBkCqoSQmcreHfwQWDekJ8HPctgns3v6L3LdupwW` | Yes (`NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA`) |
| Bitcoin | `bc1q27glxg2fr0f3jrl6m3vyy3ynuaclzwd4ya7jxq` | Recorded only (`NEXT_PUBLIC_PLATFORM_TREASURY_BTC`; no BTC pay path yet) |

Optional operator leftovers (constructor / `setFeeRecipients`): EVM `NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS`, Solana `NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA`.

New EVM collections pick treasury + operator from env at deploy time and use the 0.5% on-chain `buy()` split after `npm run contracts:bytecode`. Older live collections keep their prior BPS until redeployed (`setFeeRecipients` changes **addresses only**, not BPS). The collection **owner** can retarget recipients in the app or via CLI:

- UI: **Update fee recipients** on `/collections/[id]` (owner + EVM + deployed contract) → `POST /api/collections/[id]/set-fee-recipients` → wallet `setFeeRecipients(treasury, operator)` using current `platformFeeRecipients()` env addresses
- CLI:

```bash
COLLECTION_CONTRACT=0x... COLLECTION_OWNER_PRIVATE_KEY=0x... npm run wallets:set-fee-recipients
# dry-run:
DRY_RUN=1 COLLECTION_CONTRACT=0x... npm run wallets:set-fee-recipients
```

Top up testnet treasuries for Safe/Squads gas:

```bash
npm run wallets:fund-treasuries
```

Mainnet Safe / Squads still need a separate funded deploy when you leave testnets. Shared `NEXT_PUBLIC_EVM_MARKET_ADDRESS_*` markets remain optional — per-collection ERC-721 deploys are the primary path.

## Bridge

- UI: `/bridge`
- APIs: `/api/bridge/networks`, `/quote`, `/prepare`, `/confirm`
- Provider: [Relay](https://docs.relay.link) — natives only (no ERC-20/SPL in this slice)
- Persists `BridgeTransfer` rows when Postgres is available

## Wallets

- MetaMask / Rabby for EVM (auto chain-switch per listing network)
- Phantom for Solana auth, mint, and Solana bridge legs
- Boing Express for Boing Testnet auth and NFT deploy (`boing_requestAccounts`, `boing_signMessage`, `boing_sendTransaction`)
- Link wallets under one FreshMint session via Connect / Link buttons
