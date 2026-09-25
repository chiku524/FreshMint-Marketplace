-- Creator profile bio/links + secondary (resale) listing fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twitterUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "farcasterUrl" TEXT;

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "isSecondary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "originListingId" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "creatorRoyaltyBps" INTEGER NOT NULL DEFAULT 500;

CREATE INDEX IF NOT EXISTS "Listing_isSecondary_idx" ON "Listing"("isSecondary");
CREATE INDEX IF NOT EXISTS "Listing_sellerId_idx" ON "Listing"("sellerId");
CREATE INDEX IF NOT EXISTS "Listing_title_idx" ON "Listing"("title");
