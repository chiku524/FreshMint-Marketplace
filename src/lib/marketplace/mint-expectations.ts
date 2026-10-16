/**
 * Plain-language expectations shown on the create wizard's review step:
 * who pays gas, in which token, and the default resale royalty.
 */
import { DEFAULT_CREATOR_RESALE_ROYALTY_BPS } from "@/lib/marketplace/trust";

const TESTNETS = /sepolia|devnet|testnet|goerli|amoy|holesky/i;

export function gasTokenFor(network: string): string {
  const n = network.toLowerCase();
  if (n.includes("solana")) return "SOL";
  if (n.includes("boing")) return "BOING";
  if (n.includes("polygon")) return "POL";
  return "ETH";
}

export function mintGasExpectation(network: string, pieceCount: number): string {
  const token = gasTokenFor(network);
  const test = TESTNETS.test(network);
  const many = pieceCount > 1;
  return [
    many
      ? `Pieces mint in batches \u2014 your wallet asks for one signature per batch.`
      : "Your wallet asks for one signature.",
    test
      ? `${network} is a test network: gas is paid in free test ${token}.`
      : `You pay the network gas in ${token}; FreshMint never charges gas.`,
    many ? "Finished batches are kept if you stop and retry." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function defaultRoyaltyLabel(): string {
  return `${(DEFAULT_CREATOR_RESALE_ROYALTY_BPS / 100).toFixed(0)}% of every resale goes to you`;
}

/** Interrupted-upload breadcrumb (survives refresh / tab crash). */
export const UPLOAD_SESSION_KEY = "fm-create-upload-session";
export type UploadSession = { total: number; startedAt: number; collectionId?: string | null };

export function describeInterruptedUpload(s: UploadSession | null, now: number): string | null {
  if (!s || !Number.isFinite(s.total) || s.total <= 0) return null;
  if (now - s.startedAt > 24 * 60 * 60 * 1000) return null;
  return `Your last upload of ${s.total.toLocaleString("en-US")} file${s.total === 1 ? "" : "s"} was interrupted. Pick the same collection and re-select the files \u2014 ones that already finished are recognised and won't be duplicated.`;
}