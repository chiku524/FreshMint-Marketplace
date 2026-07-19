# FreshMint on-chain contracts

## FreshMintERC721

Minimal ERC-721 used for primary mints on Ethereum, Base, Arbitrum, and Optimism (testnets first).

```bash
# Requires Foundry (forge)
forge create contracts/FreshMintERC721.sol:FreshMintERC721 \
  --constructor-args "FreshMint" "FMINT" \
  --rpc-url $EVM_RPC_URL_ETHEREUM \
  --private-key $EVM_MINTER_PRIVATE_KEY \
  --chain sepolia
```

Repeat per network with the matching RPC:

| Network   | Testnet RPC env            | App env for address                          |
|-----------|----------------------------|----------------------------------------------|
| Ethereum  | `EVM_RPC_URL_ETHEREUM`     | `NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM`    |
| Base      | `EVM_RPC_URL_BASE`         | `NEXT_PUBLIC_EVM_MARKET_ADDRESS_BASE`        |
| Arbitrum  | `EVM_RPC_URL_ARBITRUM`     | `NEXT_PUBLIC_EVM_MARKET_ADDRESS_ARBITRUM`    |
| Optimism  | `EVM_RPC_URL_OPTIMISM`     | `NEXT_PUBLIC_EVM_MARKET_ADDRESS_OPTIMISM`    |

Without a market address for a network, EVM mint/buy intents stay **simulated** for that network.

`FreshMintMarket.sol` remains as a legacy skeleton; new deploys should use `FreshMintERC721.sol`.

## Solana

Primary mints use **Metaplex Core** on Devnet (`createV1`). Set `SOLANA_MINTER_SECRET_KEY` to sponsor Devnet mints, or let creators sign via Phantom.

Fallback: `SOLANA_MINT_MODE=memo` uses Memo program attestations only.

## Bridge

Native gas bridging (ETH on each EVM chain + SOL) goes through **Relay** (`TESTNET_RELAY_API` when `NEXT_PUBLIC_CHAIN_MODE=testnet`). See `/bridge` in the app.
