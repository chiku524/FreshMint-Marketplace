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

## Boing Testnet

Boing is a native L1 (chain id **6913** / `0x1b01`), not EVM. Marketplace deploys use Boing Express and the **official reference NFT collection bytecode**.

### Pinned bytecode

| Field | Value |
|-------|--------|
| Artifact | `boing.reference_nft_collection.v0` |
| Version | `1` |
| Vendored file | `src/lib/onchain/boing-artifacts/defaultReferenceNftCollectionTemplateBytecodeHex.ts` |
| Upstream | `boing-sdk/src/defaultReferenceNftCollectionTemplateBytecodeHex.ts` in [boing.network](https://github.com/Boing-Network/boing.network) |
| Rust source | `crates/boing-execution/src/reference_nft.rs` → `reference_nft_collection_template_bytecode()` |
| Regenerate | `cargo run -p boing-execution --example dump_reference_token_artifacts` (stdout **line 3**) |
| Override | `BOING_REFERENCE_NFT_COLLECTION_TEMPLATE_BYTECODE_HEX` |

Protocol QA **rejects empty bytecode** (`MALFORMED_BYTECODE`). The wallet payload must include `bytecode` on `contract_deploy_meta`.

### Calldata (after a collection exists)

Reference ABI is 96 bytes: selector in the **last byte** of word 0, then two argument words ([BOING-REFERENCE-NFT.md](https://github.com/Boing-Network/boing.network/blob/main/docs/BOING-REFERENCE-NFT.md)):

| Selector | Name | Use |
|----------|------|-----|
| `0x03` | `owner_of` | Read holder |
| `0x04` | `transfer_nft` | Transfer, or admin mint when owner is zero |
| `0x05` | `set_metadata_hash` | Bind metadata hash to `token_id` |

### App flow

1. Creator selects **Boing Testnet** on Create and connects **Boing Express**.
2. Soft-launch returns `boing_sendTransaction`:
   - `contract_deploy_meta` with pinned bytecode + `purpose_category: "nft"` when no collection env is set
   - `contract_call` `transfer_nft` against `NEXT_PUBLIC_BOING_NFT_COLLECTION` when set
3. Confirm via `/api/onchain/confirm` + `boing_getTransactionReceipt`.

RPC: `BOING_RPC_URL` (default `https://testnet-rpc.boing.network/`). Explorer: `https://boing.observer`. Boing is excluded from the Relay bridge.

## Bridge

Native gas bridging (ETH on each EVM chain + SOL) goes through **Relay** (`TESTNET_RELAY_API` when `NEXT_PUBLIC_CHAIN_MODE=testnet`). See `/bridge` in the app.
