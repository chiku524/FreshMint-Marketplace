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

Creates and buys stay on FreshMint (USD). On-chain work happens in two **creator-paid** phases:

1. **Create collection** — creator wallet deploys a per-collection contract (`FreshMintERC721` on EVM; Boing `contract_deploy_meta`; Solana collection attestation). Store `contractAddress` / `deployTxHash` on the collection.
2. **Soft-launch / publish** — creator wallet mints tokens **into that collection** (EVM `safeMintBatch` in chunks of 25). Each listing gets `tokenId` + `mintTxHash`.

Collector **withdraw** transfers an already-minted `tokenId` from escrow to the collector wallet — it does **not** mint into the collection.

| Step | On-chain | Who pays gas |
|------|----------|--------------|
| Create collection | Deploy contract | Creator |
| Publish / soft-launch | Batch mint into collection | Creator |
| Buy | No | — (USD on FreshMint) |
| Withdraw | Transfer existing token | Collector (usual) |

- **EVM:** Deploy bytecode from `src/lib/onchain/evm-artifacts/freshMintErc721Bytecode.ts`. Mint URI should point at media (Blob URL).
- **Solana:** Metaplex Core asset per piece at publish; Phantom signs (or server key on Devnet for legacy paths only).
- **Boing:** Collection deploy via `contract_deploy_meta` with pinned reference NFT bytecode; mints use `contract_call` when a collection address exists.
- Confirm deploy: `POST /api/collections/[id]/deploy`. Confirm mint batches: `POST /api/collections/[id]/mint`.

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

Platform sales record the 3% split on each `Purchase` row. The optional EVM `FreshMintERC721.buy` path still exists for direct on-chain checkout; prefer platform settlement so collectors skip gas until they withdraw (transfer).

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
