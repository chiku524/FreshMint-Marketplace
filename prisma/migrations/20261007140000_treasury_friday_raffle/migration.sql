-- Friday treasury raffle (one row per UTC Friday; prize claim lifecycle).
CREATE TABLE IF NOT EXISTS "TreasuryFridayRaffle" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fridayBuyId" TEXT,
    "listingId" TEXT,
    "purchaseId" TEXT,
    "winnerUserId" TEXT,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "prizeStatus" TEXT NOT NULL DEFAULT 'n/a',
    "claimAddress" TEXT,
    "claimTxHash" TEXT,
    "claimedAt" TIMESTAMP(3),
    "winnerKindsJson" TEXT NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryFridayRaffle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TreasuryFridayRaffle_windowId_key" ON "TreasuryFridayRaffle"("windowId");
CREATE INDEX IF NOT EXISTS "TreasuryFridayRaffle_winnerUserId_idx" ON "TreasuryFridayRaffle"("winnerUserId");
CREATE INDEX IF NOT EXISTS "TreasuryFridayRaffle_prizeStatus_createdAt_idx" ON "TreasuryFridayRaffle"("prizeStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "TreasuryFridayRaffle_status_createdAt_idx" ON "TreasuryFridayRaffle"("status", "createdAt");
