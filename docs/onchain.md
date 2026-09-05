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

## Minting (lazy / on withdraw)

Creates, collections, drops, and buys stay on FreshMint. Gas is paid only when a collector withdraws an NFT to a wallet, or when moving ETH / SOL / Boing.

- **EVM:** `FreshMintERC721.safeMint` — real ERC-721; token URI should point at media/metadata (Blob URL).
- **Solana:** Metaplex Core asset; Phantom signs (or server key on Devnet).
- **Boing:** Boing Express signs a native `contract_deploy_meta` with the **pinned reference NFT collection bytecode** (`boing.reference_nft_collection.v0`, purpose `nft`). Empty bytecode is rejected by protocol QA (`MALFORMED_BYTECODE`). If `NEXT_PUBLIC_BOING_NFT_COLLECTION` is set, mint uses `contract_call` with official `transfer_nft` (selector `0x04`) calldata instead. No server-side Boing minter key in this slice.
- Withdraw (`POST /api/withdraw`) prepares a wallet tx; `/api/onchain/confirm` stores the hash and verifies when a live market/RPC is configured.
- Listings show **Minted** + explorer links when `mintTxHash` is set.

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

Platform sales record the 3% split on each `Purchase` row. The optional EVM `FreshMintERC721.buy` path still exists for direct on-chain checkout; prefer platform settlement so collectors skip gas until they withdraw.

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
