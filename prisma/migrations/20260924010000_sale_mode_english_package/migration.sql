-- Sale mode + English auction + collection package sell

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "saleMode" TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "startingBidUsd" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "reserveUsd" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "currentHighBidUsd" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "highBidderId" TEXT;

UPDATE "Listing" SET "saleMode" = 'timed_window' WHERE "type" = 'auction' AND ("saleMode" IS NULL OR "saleMode" = 'fixed');

ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "packageSellEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "packagePriceUsd" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "Bid" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Bid_listingId_createdAt_idx" ON "Bid"("listingId", "createdAt");
CREATE INDEX IF NOT EXISTS "Bid_bidderId_idx" ON "Bid"("bidderId");

DO $$ BEGIN
  ALTER TABLE "Bid" ADD CONSTRAINT "Bid_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey"
    FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Listing" ADD CONSTRAINT "Listing_highBidderId_fkey"
    FOREIGN KEY ("highBidderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PackagePurchase" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "listingIdsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "payNetwork" TEXT,
    "paymentTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackagePurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PackagePurchase_collectionId_idx" ON "PackagePurchase"("collectionId");
CREATE INDEX IF NOT EXISTS "PackagePurchase_buyerId_idx" ON "PackagePurchase"("buyerId");

DO $$ BEGIN
  ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "packagePurchaseId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_packagePurchaseId_fkey"
    FOREIGN KEY ("packagePurchaseId") REFERENCES "PackagePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Purchase_packagePurchaseId_idx" ON "Purchase"("packagePurchaseId");
CREATE INDEX IF NOT EXISTS "Listing_saleMode_idx" ON "Listing"("saleMode");
CREATE INDEX IF NOT EXISTS "Listing_highBidderId_idx" ON "Listing"("highBidderId");