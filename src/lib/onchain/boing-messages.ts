/** Client-safe Boing mint / publish error copy (no Node RPC imports). */

export function formatBoingMintUserMessage(error: string | undefined): string {
  const raw = (error ?? "").trim();
  const code = raw.toLowerCase();
  if (
    code.includes("account not found") ||
    code.includes("account_not_found") ||
    code === "boing_collection_account_missing" ||
    code === "boing_creator_account_missing"
  ) {
    if (code.includes("creator")) {
      return "Boing wallet account not found on-chain. Open Boing Express, unlock the same wallet you linked, then retry.";
    }
    return "This collection’s on-chain contract was not found on Boing. Re-deploy the collection (or sync deploy from the create wizard), then retry Mint & publish.";
  }
  if (
    code === "collection_not_deployed" ||
    code === "onchain_deploy_not_found" ||
    code === "boing_contract_unresolved"
  ) {
    return "Collection is not fully deployed on-chain yet. Finish deploy in the create wizard, then retry mint.";
  }
  if (
    code === "boing_account_id_required" ||
    code === "boing_collection_required"
  ) {
    return "Connect your Boing Express wallet (32-byte account id) and ensure the collection has a real contract address.";
  }
  if (code === "boing_tx_id_required") {
    return "Boing wallet did not return a transaction id (mempool ok is not a mint receipt). Wait a moment and retry this batch.";
  }
  if (code === "boing_token_not_on_chain") {
    return "Mint receipt landed, but the token is not readable on Boing yet. Wait a moment and retry Mint & publish.";
  }
  if (code === "simulated_mint_not_allowed") {
    return "Wallet mint is required — simulated mint hashes are not accepted on live chains.";
  }
  return raw || "mint_failed";
}
