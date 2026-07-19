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

## Bridge

- UI: `/bridge`
- APIs: `/api/bridge/networks`, `/quote`, `/prepare`, `/confirm`
- Provider: [Relay](https://docs.relay.link) — natives only (no ERC-20/SPL in this slice)
- Persists `BridgeTransfer` rows when Postgres is available

## Wallets

- MetaMask / Rabby for EVM (auto chain-switch per listing network)
- Phantom for Solana auth, mint, and Solana bridge legs
- Link both under one FreshMint session via Connect / Link buttons
