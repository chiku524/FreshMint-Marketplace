-- Cache column for on-chain registry companion fungible token links (many, mutable).
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "linkedTokensJson" TEXT NOT NULL DEFAULT '[]';
