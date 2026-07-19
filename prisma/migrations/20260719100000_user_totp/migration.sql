-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "totpSecretEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "totpVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "backupCodesHash" TEXT;
