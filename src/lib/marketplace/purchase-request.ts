import { z } from "zod";

const usdAmount = z.coerce.number().positive();

export const purchaseBodySchema = z.object({
  listingId: z.string().trim().min(1),
  amountUsd: usdAmount.optional(),
  txHash: z.string().min(8).optional(),
  buyerAddress: z.string().trim().min(1).optional(),
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
