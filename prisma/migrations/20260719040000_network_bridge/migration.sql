-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN "network" TEXT;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "network" TEXT NOT NULL DEFAULT 'ethereum';

-- CreateIndex
CREATE INDEX "Listing_network_idx" ON "Listing"("network");

-- CreateTable
CREATE TABLE "BridgeTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromNetwork" TEXT NOT NULL,
    "toNetwork" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "requestId" TEXT,
    "txHashesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'quoted',
    "quoteJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BridgeTransfer_userId_idx" ON "BridgeTransfer"("userId");

-- CreateIndex
CREATE INDEX "BridgeTransfer_requestId_idx" ON "BridgeTransfer"("requestId");

-- AddForeignKey
ALTER TABLE "BridgeTransfer" ADD CONSTRAINT "BridgeTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill solana listings
UPDATE "Listing" SET "network" = 'solana' WHERE "chain" = 'solana';
