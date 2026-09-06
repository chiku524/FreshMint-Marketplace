import { z } from "zod";

const usdAmount = z.coerce.number().positive();
const networkId = z.enum([
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "solana",
  "boing",
]);

export const purchaseBodySchema = z.object({
  listingId: z.string().trim().min(1),
  /** Crypto-only primary buy. */
  payNetwork: networkId,
  buyerPaymentAddress: z.string().trim().min(1),
  buyerReceiveAddress: z.string().trim().min(1),
  amountUsd: usdAmount.optional(),
  /** Optional: complete in one shot with simulated/local hashes (tests). */
  simulate: z.boolean().optional(),
  paymentTxHash: z.string().min(8).optional(),
  transferTxHash: z.string().min(8).optional(),
  bridgeRequestId: z.string().optional(),
});

export const purchaseConfirmSchema = z.object({
  purchaseId: z.string().trim().min(1),
  step: z.enum(["payment", "transfer"]),
  txHash: z.string().min(8),
  bridgeRequestId: z.string().optional(),
});

export const purchaseQuoteSchema = z.object({
  listingId: z.string().trim().min(1),
  payNetwork: networkId,
});

export const prepareBodySchema = z.object({
  listingId: z.string().trim().min(1),
  action: z.enum(["mint", "buy"]),
  amountUsd: z.coerce.number().nonnegative().optional(),
  buyerAddress: z.string().trim().min(1).optional(),
});

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
