# FreshMintMarket (Sepolia)

Minimal mint/buy contract used by FreshMint settlement intents.

## Deploy with Foundry

```bash
forge init --no-commit --force tmp-forge 2>/dev/null || true
# from repo root, with Foundry installed:
forge create contracts/FreshMintMarket.sol:FreshMintMarket \
  --rpc-url $EVM_RPC_URL \
  --private-key $EVM_MINTER_PRIVATE_KEY \
  --chain sepolia
```

Then set:

```bash
NEXT_PUBLIC_EVM_MARKET_ADDRESS=0xYourDeployedAddress
EVM_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# optional server-side sender:
EVM_MINTER_PRIVATE_KEY=0x...
```

Without a market address, EVM flows stay in **simulated** mode. With an address, the API returns wallet-ready calldata (`pending_wallet`) or submits via the server key.

## Solana Devnet

Settlement attestations use the Memo program on Devnet. Set `SOLANA_MINTER_SECRET_KEY` as a JSON byte array for server-sponsored memos, or sign from a Phantom wallet using `/api/onchain/prepare`.
