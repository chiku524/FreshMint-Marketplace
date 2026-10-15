-- Boing reference NFT template version per collection ("1" | "2").
-- Existing rows default to "1" (one mint per tx; no mint_batch / 0x06).
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "nftTemplateVersion" TEXT NOT NULL DEFAULT '1';
