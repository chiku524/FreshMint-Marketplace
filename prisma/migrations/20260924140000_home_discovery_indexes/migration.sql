-- Indexes for homepage 7d volume + 72h hot-works aggregates
CREATE INDEX IF NOT EXISTS "Purchase_status_createdAt_idx" ON "Purchase"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SignalEvent_createdAt_listingId_idx" ON "SignalEvent"("createdAt", "listingId");
CREATE INDEX IF NOT EXISTS "Bid_createdAt_idx" ON "Bid"("createdAt");
