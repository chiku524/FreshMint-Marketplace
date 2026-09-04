import { beforeEach, describe, expect, it } from "vitest";
import { memoryAccountStore, resetMemoryAccountsForTests } from "@/lib/auth/account";
import { linkWalletToUser, upsertUserFromWallet } from "@/lib/auth/wallet";
import {
  enableMemoryMode,
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
