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

**Boing is a native L1**, not an EVM chain. Do not add it via MetaMask `wallet_addEthereumChain`. Use [Boing Express](https://boing.express) (`window.boing`) and 32-byte account ids (`0x` + 64 hex). Public RPC: `https://testnet-rpc.boing.network/`. Explorer: `https://boing.observer`. Boing is **not** on Relay — `/bridge` excludes it.

## Collection deploy + mint at publish

Creates stay on FreshMint; **primary buys are crypto-only** with ownership at purchase. On-chain work happens in two **creator-paid** phases, then a collector-paid settlement:

1. **Create collection** — creator wallet deploys a per-collection contract (`FreshMintERC721` on EVM; Boing `contract_deploy_meta`; Solana collection attestation). Store `contractAddress` / `deployTxHash` on the collection.
2. **Soft-launch / publish** — creator wallet mints tokens **into that collection** (EVM `safeMintBatch` in chunks of 25). Each listing gets `tokenId` + `mintTxHash`. Soft-launch is **blocked** until mint confirms (`listing_not_minted`). Unminted listings cannot be bought.
3. **Buy** — collector pays native on the listing network (or bridges via Relay when paying from another Relay network), then escrow `transferFrom` → buyer wallet. Purchase status: `pending_payment` → `pending_transfer` → `completed` (with `withdrawnAt` set when ownership is delivered). Interrupted buys can be resumed from `/me` via `POST /api/purchase/resume`.

| Step | On-chain | Who pays gas |
|------|----------|--------------|
| Create collection | Deploy contract | Creator |
| Publish / soft-launch | Batch mint into collection | Creator |
| Buy (same-chain) | Pay native + NFT transfer | Collector |
| Buy (cross-chain) | Relay bridge + NFT transfer on listing chain | Collector |
| Withdraw | Legacy USD holds only | Collector |

**Cross-chain:** Relay covers EVM natives ↔ Solana (e.g. pay ETH for a Solana NFT). **Boing is not on Relay** — Boing listings are same-chain BOING only.

- **EVM:** Deploy bytecode from `src/lib/onchain/evm-artifacts/freshMintErc721Bytecode.ts`. Mint URI should point at media (Blob URL). Settlement prefers escrow `transferFrom` over listing `buy()`.
- **Solana:** Metaplex Core asset per piece at publish; Phantom signs (or server key on Devnet for legacy paths only).
- **Boing:** Collection deploy via `contract_deploy_meta` with pinned reference NFT bytecode; mints use `contract_call` when a collection address exists.
- Confirm deploy: `POST /api/collections/[id]/deploy`. Confirm mint batches: `POST /api/collections/[id]/mint`.
- Buy: `POST /api/purchase` (crypto fields), confirm steps: `POST /api/purchase/confirm`, quote: `POST /api/purchase/quote`.

## Platform fees (primary sales)

Every purchase takes a **3%** treasury fee from the listed price (buyer still pays the listed amount):

| Share | BPS | Recipient |
|-------|-----|-----------|
| 3%    | 300 | Marketplace treasury — community, events, and future updates (EVM Safe 2-of-3 + Solana Squads vault) |
| 97%   | —   | Seller |

Generate keys locally (secrets stay in gitignored `.wallets/`):

```bash
npm run wallets:create
# after funding owner #1 / a Solana payer:
npm run wallets:deploy-safe
npm run wallets:deploy-squads
```

Env: `NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS`, `NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA`, `NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS`, `NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA`.

Platform sales record the 3% split on each `Purchase` row. Primary checkout settles in listing-chain native (fee taken in that currency when possible). The optional EVM `FreshMintERC721.buy` path still exists for direct on-chain checkout; marketplace settlement uses pay-to-platform + escrow transfer so price can stay USD-labeled while payment is native-quoted.

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
