# FreshMint on-chain contracts

## FreshMintERC721

Minimal ERC-721 used for primary mints on Ethereum, Base, Arbitrum, and Optimism (testnets first).

Primary `buy()` takes a **2.5%** platform fee (1.5% treasury + 1% operator); the seller receives **97.5%**. Fee recipients are set in the constructor and can be updated later via `setFeeRecipients` (contract owner only).

```bash
# Requires Foundry (forge)
# Prefer the Safe + operator addresses from `npm run wallets:create` (.wallets/env.snippet)
forge create contracts/FreshMintERC721.sol:FreshMintERC721 \
  --constructor-args "FreshMint" "FMINT" $NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS $NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS \
  --rpc-url $EVM_RPC_URL_ETHEREUM \
  --private-key $EVM_MINTER_PRIVATE_KEY \
  --chain sepolia
```

Also set `NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA` / `NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA` for Solana fee legs.

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
