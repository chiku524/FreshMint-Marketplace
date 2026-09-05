-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "withdrawTxHash" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "withdrawAddress" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
