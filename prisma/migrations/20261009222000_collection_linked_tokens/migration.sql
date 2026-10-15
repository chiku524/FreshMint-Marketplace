-- Display-only companion fungible token links on collections (many, mutable).
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "linkedTokensJson" TEXT NOT NULL DEFAULT '[]';
