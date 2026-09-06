-- AlterTable
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "network" TEXT NOT NULL DEFAULT 'ethereum';
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "contractAddress" TEXT;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "deployTxHash" TEXT;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "deployStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "escrowAddress" TEXT;
