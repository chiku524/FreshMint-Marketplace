/**
 * Official reference NFT collection template **v2** bytecode (mint_batch / 0x06).
 *
 * Pin from `cargo run -p boing-execution --example dump_reference_token_artifacts`
 * stdout **line 3** after nodes + QA allow the v2 template. Until then this stays
 * null and FreshMint keeps deploying / healing with v1.
 *
 * Override without a code change:
 * `BOING_REFERENCE_NFT_COLLECTION_TEMPLATE_V2_BYTECODE_HEX`
 */
export const DEFAULT_REFERENCE_NFT_COLLECTION_TEMPLATE_V2_BYTECODE_HEX:
  | `0x${string}`
  | null = null;
