import { z } from "zod";

const networkId = z.enum([
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "solana",
  "boing",
]);

export const boostPrepareSchema = z.object({
  payNetwork: networkId,
  fromAddress: z.string().trim().min(1),
});

export const boostConfirmSchema = z.object({
  payNetwork: networkId,
  txHash: z.string().trim().min(8),
});

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
