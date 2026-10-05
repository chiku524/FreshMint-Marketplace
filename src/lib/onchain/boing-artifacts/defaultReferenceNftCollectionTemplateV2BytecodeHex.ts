/**
 * Historical reference NFT collection template **v2** bytecode (`mint_batch` / 0x06, n≤50).
 *
 * New deploys prefer **v3** (`defaultReferenceNftCollectionTemplateV3BytecodeHex.ts`).
 * Keep this null unless a distinct historical v2 dump must be vendored for heal of
 * collections stamped `"2"`. Runtime can still read
 * `BOING_REFERENCE_NFT_COLLECTION_TEMPLATE_V2_BYTECODE_HEX`.
 */
export const DEFAULT_REFERENCE_NFT_COLLECTION_TEMPLATE_V2_BYTECODE_HEX:
  | `0x${string}`
  | null = null;
