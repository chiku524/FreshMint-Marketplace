import { getSessionUser } from "@/lib/auth/session";
import {
  mergeLinkedTokenLabels,
  planLinkedTokenRegistryWrite,
  readLinkedTokensFromRegistry,
} from "@/lib/marketplace/linked-token-registry";
import {
  cacheCollectionLinkedTokens,
  getDiscoveryEngine,
} from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const tokenRowSchema = z.object({
  address: z.string().min(1).max(128),
  label: z.union([z.string().max(64), z.null()]).optional(),
  chain: z.enum(["evm", "solana", "boing"]).nullable().optional(),
});

const bodySchema = z.object({
  tokens: z.array(tokenRowSchema),
  /** Linked wallet that will sign registry txs (must be claimer of both sides). */
  creatorAddress: z.string().min(1).max(128).optional(),
});

const confirmSchema = z.object({
  /** Optional label hints merged onto registry peers when refreshing cache. */
  tokens: z.array(tokenRowSchema).optional(),
});

async function loadOwnedCollection(collectionId: string, userId: string) {
  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(collectionId);
  if (!existing) return { error: "collection_not_found" as const };
  if (existing.creatorId !== userId) return { error: "collection_forbidden" as const };
  return { collection: existing };
}

/**
 * GET — refresh cache from on-chain registry (Boing). Returns cached peers + sync status.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  const { id } = await params;
  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(id);
  if (!existing) {
    return NextResponse.json({ error: "collection_not_found" }, { status: 404 });
  }

  const sync = await readLinkedTokensFromRegistry({
    chain: existing.chain,
    collectionAddress: existing.contractAddress,
    labelHints: existing.linkedTokens ?? [],
  });

  if (sync.ok && user?.id === existing.creatorId) {
    await cacheCollectionLinkedTokens({
      collectionId: id,
      creatorId: user.id,
      tokens: sync.tokens,
      fromRegistry: true,
    });
  }

  return NextResponse.json({
    ok: sync.ok,
    source: "registry",
    cached: existing.linkedTokens ?? [],
    tokens: sync.ok ? sync.tokens : existing.linkedTokens ?? [],
    registryAddress: sync.ok ? sync.registryAddress : null,
    error: sync.ok ? undefined : sync.error,
  });
}

/**
 * PUT — plan on-chain registry writes (wallet txs). Does **not** treat DB as SoT.
 * Body tokens = desired peer set after apply. Owner/deployer session required.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const owned = await loadOwnedCollection(id, user.id);
  if ("error" in owned) {
    const status = owned.error === "collection_not_found" ? 404 : 403;
    return NextResponse.json({ ok: false, errors: [owned.error] }, { status });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const creatorAddress =
    parsed.data.creatorAddress?.trim() ||
    user.wallets?.find((w) => w.chain === "boing")?.address ||
    "";

  if (!creatorAddress) {
    return NextResponse.json(
      { ok: false, errors: ["creator_address_required"] },
      { status: 400 },
    );
  }

  const plan = await planLinkedTokenRegistryWrite({
    chain: owned.collection.chain,
    collectionAddress: owned.collection.contractAddress,
    creatorAddress,
    desiredTokens: parsed.data.tokens,
  });

  if (!plan.ok) {
    const status = plan.error === "registry_address_unset" ? 503 : 400;
    return NextResponse.json(
      { ok: false, errors: plan.errors ?? [plan.error], error: plan.error },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    source: "registry",
    registryAddress: plan.registryAddress,
    desired: plan.desired,
    walletTxs: plan.walletTxs,
    steps: plan.steps,
    note:
      "Sign walletTxs (claim×2 + register_link and/or unlink_at). Dual claimer auth: signer must be claimer of both collection and token. Then POST confirm to refresh the DB cache.",
  });
}

/**
 * POST — after registry txs confirm, re-read chain and refresh DB cache.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const owned = await loadOwnedCollection(id, user.id);
  if ("error" in owned) {
    const status = owned.error === "collection_not_found" ? 404 : 403;
    return NextResponse.json({ ok: false, errors: [owned.error] }, { status });
  }

  let labelHints = owned.collection.linkedTokens ?? [];
  try {
    const json = await req.json();
    const parsed = confirmSchema.safeParse(json);
    if (parsed.success && parsed.data.tokens?.length) {
      labelHints = mergeLinkedTokenLabels(
        parsed.data.tokens.map((t) => ({
          address: t.address,
          label: t.label ?? null,
          chain: t.chain ?? null,
        })),
        labelHints,
      );
    }
  } catch {
    // empty body OK
  }

  const sync = await readLinkedTokensFromRegistry({
    chain: owned.collection.chain,
    collectionAddress: owned.collection.contractAddress,
    labelHints,
  });
  if (!sync.ok) {
    return NextResponse.json(
      { ok: false, error: sync.error, errors: [sync.error] },
      { status: sync.error === "registry_address_unset" ? 503 : 400 },
    );
  }

  const cached = await cacheCollectionLinkedTokens({
    collectionId: id,
    creatorId: user.id,
    tokens: sync.tokens,
    fromRegistry: true,
  });
  if (!cached.ok) {
    return NextResponse.json({ ok: false, errors: cached.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    source: "registry",
    registryAddress: sync.registryAddress,
    collection: {
      id: cached.collection.id,
      linkedTokens: cached.collection.linkedTokens ?? [],
    },
  });
}
