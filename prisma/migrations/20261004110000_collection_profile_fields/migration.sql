-- OpenSea-like collection profile media + socials (nullable / empty defaults).
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "bannerUrl" TEXT;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "twitterUrl" TEXT;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "discordUrl" TEXT;
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT;
