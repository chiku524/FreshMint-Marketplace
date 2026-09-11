import type { LaunchStage, Listing } from "@/lib/discovery/types";
import type { RisingDiagnosis } from "@/lib/discovery";

/** Abandoned checkouts release 1/1 inventory after this window. */
export const PENDING_PAYMENT_TTL_MS = 15 * 60 * 1000;

const STAGE_LABELS: Record<LaunchStage, string> = {
  draft: "Draft",
  soft_launch: "Open Lane",
  rising_eligible: "Rising",
  featured_eligible: "Featured eligible",
  featured: "Featured",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as LaunchStage] ?? stage.replaceAll("_", " ");
}

export function purchaseCreatedAtMs(purchase: {
  soldAt?: number | null;
  createdAt?: Date | number | null;
}): number {
  if (typeof purchase.soldAt === "number") return purchase.soldAt;
  if (purchase.createdAt instanceof Date) return purchase.createdAt.getTime();
  if (typeof purchase.createdAt === "number") return purchase.createdAt;
  return 0;
}

/** Completed sales and in-flight paid transfers hold supply. Fresh unpaid checkouts hold it briefly. */
export function purchaseReservesSupply(
  purchase: {
    status?: string | null;
    soldAt?: number | null;
    createdAt?: Date | number | null;
  },
  now = Date.now(),
): boolean {
  const status = purchase.status ?? "completed";
  if (status === "failed") return false;
  if (status === "pending_payment") {
    return now - purchaseCreatedAtMs(purchase) < PENDING_PAYMENT_TTL_MS;
  }
  return status === "completed" || status === "pending_transfer";
}

export function purchaseIsOpenCheckout(status: string | null | undefined): boolean {
  return status === "pending_payment" || status === "pending_transfer";
}

export function canUserStageListing(
  user: { id: string; role?: string } | null | undefined,
  listing: { creatorId: string },
): boolean {
  if (!user) return false;
  if (user.id === listing.creatorId) return true;
  return user.role === "editor" || user.role === "moderator";
}

export function creatorLifecycleHint(
  listing: Pick<Listing, "stage" | "tokenId" | "contractAddress" | "mintTxHash">,
  sold: boolean,
  diagnosis?: RisingDiagnosis | null,
): string {
  const minted = Boolean(
    listing.tokenId && listing.contractAddress && listing.mintTxHash,
  );
  if (sold) return "Sold — proceeds settled on-chain at purchase";
  if (listing.stage === "draft" && !minted) {
    return "Draft — finish publish mint before this can go live";
  }
  if (listing.stage === "draft" && minted) {
    return "Minted draft — soft-launch to appear on Open Lane";
  }
  if (listing.stage === "soft_launch") {
    if (diagnosis?.errors.includes("new_wallet_cooldown")) {
      const hours = Math.max(
        1,
        Math.round((diagnosis.cooldownRemainingMs || 0) / (60 * 60 * 1000)),
      );
      return `Live on Open Lane — Rising in about ${hours}h when the new-wallet wait ends`;
    }
    if (diagnosis?.errors.includes("rising_weekly_cap")) {
      return "Live on Open Lane — weekly Rising cap reached; it rolls with the UTC week";
    }
    if (diagnosis?.ready) {
      return "Live on Open Lane — Rising is automatic on the next discovery refresh";
    }
    return "Live on Open Lane — your first work auto-enters Rising; later works wait out the new-wallet cooldown and weekly cap";
  }
  if (listing.stage === "rising_eligible") {
    return "In Rising — collectors can find you without a Featured pin";
  }
  if (listing.stage === "featured_eligible") {
    return "Featured-eligible — Studio can pin it";
  }
  if (listing.stage === "featured") return "Featured";
  return stageLabel(listing.stage);
}
