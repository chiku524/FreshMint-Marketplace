-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "traitsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Listing" ADD COLUMN "maxSupply" INTEGER;

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "dropKind" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Collection" ADD COLUMN "dropStartsAt" TIMESTAMP(3);
ALTER TABLE "Collection" ADD COLUMN "dropEndsAt" TIMESTAMP(3);
ALTER TABLE "Collection" ADD COLUMN "dropPriceUsd" DOUBLE PRECISION;
ALTER TABLE "Collection" ADD COLUMN "mediaBytes" INTEGER NOT NULL DEFAULT 0;
