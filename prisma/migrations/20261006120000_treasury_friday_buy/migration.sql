-- Idempotent Friday treasury buy window (one row per UTC Friday).
CREATE TABLE IF NOT EXISTS "TreasuryFridayBuy" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "listingId" TEXT,
    "purchaseId" TEXT,
    "amountUsd" DOUBLE PRECISION,
    "chain" TEXT,
    "network" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "paymentTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryFridayBuy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TreasuryFridayBuy_windowId_key" ON "TreasuryFridayBuy"("windowId");
CREATE INDEX IF NOT EXISTS "TreasuryFridayBuy_status_createdAt_idx" ON "TreasuryFridayBuy"("status", "createdAt");
