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

Set `NEXT_PUBLIC_CHAIN_MODE=testnet` (default) or `mainnet`.

## Minting

- **EVM:** `FreshMintERC721.safeMint` — real ERC-721; token URI should point at media/metadata (Blob URL).
- **Solana:** Metaplex Core asset; Phantom signs (or server key on Devnet).
- Soft-launch prepares a wallet tx; `/api/onchain/confirm` stores the hash and verifies when a live market/RPC is configured.
- Listings show **Minted** + explorer links when `mintTxHash` is set.

## Platform fees (primary sales)

Every purchase takes a **2.5%** fee from the listed price (buyer still pays the listed amount):

| Share | BPS | Recipient |
|-------|-----|-----------|
| 1.5%  | 150 | Marketplace treasury — EVM Safe 2-of-3 + Solana Squads vault |
| 1.0%  | 100 | Operator — normal EVM EOA + Solana keypair |
| 97.5% | —   | Seller |

Generate keys locally (secrets stay in gitignored `.wallets/`):

```bash
npm run wallets:create
# after funding owner #1 / a Solana payer:
npm run wallets:deploy-safe
npm run wallets:deploy-squads
```

Env: `NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS`, `NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA`, `NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS`, `NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA`.

On EVM, `FreshMintERC721.buy` enforces the split on-chain and emits `FeesDistributed`. Pass the Safe + operator EOA in the constructor (see `contracts/README.md`). The app mirrors the same split on each `Purchase` row for accounting. Solana buys currently record the fee split in the database; send native fee legs to the Squads vault once settlement is live.

## Bridge

- UI: `/bridge`
- APIs: `/api/bridge/networks`, `/quote`, `/prepare`, `/confirm`
- Provider: [Relay](https://docs.relay.link) — natives only (no ERC-20/SPL in this slice)
- Persists `BridgeTransfer` rows when Postgres is available

## Wallets

- MetaMask / Rabby for EVM (auto chain-switch per listing network)
- Phantom for Solana auth, mint, and Solana bridge legs
- Link both under one FreshMint session via Connect / Link buttons
