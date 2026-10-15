import { beforeEach, describe, expect, it } from "vitest";
import { memoryAccountStore, resetMemoryAccountsForTests } from "@/lib/auth/account";
import {
  linkWalletToUser,
  unlinkWalletFromUser,
  upsertUserFromWallet,
} from "@/lib/auth/wallet";
import {
  enableMemoryMode,
  getMemoryState,
  recordMemoryPurchase,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret-32chars-minimum!!";
  resetMemoryStoreForTests();
  resetMemoryAccountsForTests();
  enableMemoryMode("unit-test");
});

describe("linkWalletToUser", () => {
  it("moves a wallet-only orphan onto the signed-in profile", async () => {
    const orphan = await upsertUserFromWallet({
      chain: "solana",
      address: "SolOrphan1111111111111111111111111111111",
    });
    const main = await upsertUserFromWallet({
      chain: "evm",
      address: "0x1111111111111111111111111111111111111111",
    });

    const linked = await linkWalletToUser({
      userId: main.id,
      chain: "solana",
      address: "SolOrphan1111111111111111111111111111111",
    });

    expect(linked.userId).toBe(main.id);
    expect(orphan.id).not.toBe(main.id);
  });

  it("does not steal a wallet from an account that has email login", async () => {
    const other = await upsertUserFromWallet({
      chain: "solana",
      address: "SolTaken11111111111111111111111111111111",
    });
    memoryAccountStore().set(other.id, {
      userId: other.id,
      email: "held@example.com",
      emailVerifiedAt: Date.now(),
      passwordHash: "x",
      googleId: null,
      avatarUrl: null,
    });
    const main = await upsertUserFromWallet({
      chain: "evm",
      address: "0x2222222222222222222222222222222222222222",
    });

    await expect(
      linkWalletToUser({
        userId: main.id,
        chain: "solana",
        address: "SolTaken11111111111111111111111111111111",
      }),
    ).rejects.toThrow("wallet_already_linked");
  });
});

describe("unlinkWalletFromUser", () => {
  it("unlinks a secondary wallet and marks the oldest as primary", async () => {
    const main = await upsertUserFromWallet({
      chain: "evm",
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    await linkWalletToUser({
      userId: main.id,
      chain: "solana",
      address: "SolSecondary111111111111111111111111111",
    });

    const result = await unlinkWalletFromUser({
      userId: main.id,
      chain: "solana",
      address: "SolSecondary111111111111111111111111111",
    });

    expect(result.wasPrimary).toBe(false);
    const creator = getMemoryState().creators.get(main.id)!;
    expect(creator.wallets).toHaveLength(1);
    expect(creator.wallets[0]!.chain).toBe("evm");
  });

  it("blocks unlinking the last wallet when it is the only sign-in method", async () => {
    const main = await upsertUserFromWallet({
      chain: "evm",
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    await expect(
      unlinkWalletFromUser({
        userId: main.id,
        chain: "evm",
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).rejects.toThrow("last_sign_in_method");
  });

  it("allows unlinking the last (primary) wallet when email sign-in exists", async () => {
    const main = await upsertUserFromWallet({
      chain: "evm",
      address: "0xcccccccccccccccccccccccccccccccccccccccc",
    });
    memoryAccountStore().set(main.id, {
      userId: main.id,
      email: "safe@example.com",
      emailVerifiedAt: Date.now(),
      passwordHash: "x",
      googleId: null,
      avatarUrl: null,
    });

    const result = await unlinkWalletFromUser({
      userId: main.id,
      chain: "evm",
      address: "0xcccccccccccccccccccccccccccccccccccccccc",
    });

    expect(result.wasPrimary).toBe(true);
    expect(getMemoryState().creators.get(main.id)!.wallets).toHaveLength(0);
  });

  it("blocks unlink while an open checkout is in flight on that chain", async () => {
    const main = await upsertUserFromWallet({
      chain: "evm",
      address: "0xdddddddddddddddddddddddddddddddddddddddd",
    });
    await linkWalletToUser({
      userId: main.id,
      chain: "solana",
      address: "SolCheckout1111111111111111111111111111",
    });
    recordMemoryPurchase({
      id: "purchase-open-1",
      listingId: "listing-1",
      buyerId: main.id,
      amountUsd: 10,
      soldAt: Date.now(),
      status: "pending_payment",
      txHash: null,
      chain: "evm",
    });

    await expect(
      unlinkWalletFromUser({
        userId: main.id,
        chain: "evm",
        address: "0xdddddddddddddddddddddddddddddddddddddddd",
      }),
    ).rejects.toThrow("open_checkout");

    // Other chains remain unlinkable.
    await expect(
      unlinkWalletFromUser({
        userId: main.id,
        chain: "solana",
        address: "SolCheckout1111111111111111111111111111",
      }),
    ).resolves.toMatchObject({ chain: "solana" });
  });

  it("does not delete listings when a wallet is unlinked", async () => {
    const main = await upsertUserFromWallet({
      chain: "evm",
      address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });
    await linkWalletToUser({
      userId: main.id,
      chain: "boing",
      address: `0x${"ab".repeat(32)}`,
    });
    const state = getMemoryState();
    const listingId = "listing-keep";
    state.listings.set(listingId, {
      ...(state.listings.values().next().value as object),
      id: listingId,
      title: "Keep me",
      creatorId: main.id,
      chain: "evm",
      network: "ethereum",
      stage: "soft_launch",
    } as never);

    await unlinkWalletFromUser({
      userId: main.id,
      chain: "evm",
      address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });

    expect(state.listings.get(listingId)?.creatorId).toBe(main.id);
    expect(state.creators.get(main.id)!.wallets).toHaveLength(1);
  });
});
