import { getSessionUser } from "@/lib/auth/session";
import {
  getCollectionPackageEligibility,
  prepareCollectionPackagePurchase,
  quoteCollectionPackagePay,
  updateCollectionPackageSell,
} from "@/lib/marketplace/package-sell";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eligibility = await getCollectionPackageEligibility(id);
  return NextResponse.json(eligibility);
}

const patchSchema = z.object({
  packageSellEnabled: z.boolean(),
  packagePriceUsd: z.number().nonnegative().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await updateCollectionPackageSell({
    collectionId: id,
    creatorId: user.id,
    packageSellEnabled: parsed.data.packageSellEnabled,
    packagePriceUsd: parsed.data.packagePriceUsd,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

const buySchema = z.object({
  payNetwork: z.enum([
    "ethereum",
    "base",
    "arbitrum",
    "optimism",
    "solana",
    "boing",
  ]),
  buyerPaymentAddress: z.string().min(1).optional(),
  buyerReceiveAddress: z.string().min(1).optional(),
  /** Live Relay quote only — does not create purchases. */
  quoteOnly: z.boolean().optional(),
  /** Explicit fallback checkout without a wallet (dev / preview). */
  simulate: z.boolean().optional(),
  paymentTxHash: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = buySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (parsed.data.quoteOnly) {
    const quoted = await quoteCollectionPackagePay({
      collectionId: id,
      payNetwork: parsed.data.payNetwork,
      buyerPaymentAddress: parsed.data.buyerPaymentAddress,
    });
    if (!quoted.ok) {
      return NextResponse.json(quoted, { status: 400 });
    }
    return NextResponse.json(quoted);
  }

  if (!parsed.data.buyerPaymentAddress || !parsed.data.buyerReceiveAddress) {
    return NextResponse.json(
      { error: "buyer_addresses_required" },
      { status: 400 },
    );
  }

  const result = await prepareCollectionPackagePurchase({
    collectionId: id,
    buyerId: user.id,
    payNetwork: parsed.data.payNetwork,
    buyerPaymentAddress: parsed.data.buyerPaymentAddress,
    buyerReceiveAddress: parsed.data.buyerReceiveAddress,
    simulate: parsed.data.simulate,
    paymentTxHash: parsed.data.paymentTxHash,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
