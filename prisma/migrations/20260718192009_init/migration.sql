-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "firstListingAt" DATETIME,
    "lifetimePrimaryVolumeUsd" REAL NOT NULL DEFAULT 0,
    "completedSales" INTEGER NOT NULL DEFAULT 0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "washCluster" BOOLEAN NOT NULL DEFAULT false,
    "verifiedCreator" BOOLEAN NOT NULL DEFAULT false,
    "risingEntriesThisWeek" INTEGER NOT NULL DEFAULT 0,
    "openLaneListingsToday" INTEGER NOT NULL DEFAULT 0,
    "curatorScore" INTEGER NOT NULL DEFAULT 20,
    "establishedBadge" BOOLEAN NOT NULL DEFAULT false,
    "walletCreatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "creatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'draft',
    "priceUsd" REAL,
    "medium" TEXT NOT NULL DEFAULT 'digital',
    "styleTagsJson" TEXT NOT NULL DEFAULT '[]',
    "mediaHash" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "metadataComplete" BOOLEAN NOT NULL DEFAULT true,
    "originalMedia" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "softLaunchedAt" DATETIME,
    "risingEligibleAt" DATETIME,
    "featuredAt" DATETIME,
    "oeStartsAt" DATETIME,
    "oeEndsAt" DATETIME,
    "auctionStartsAt" DATETIME,
    "auctionEndsAt" DATETIME,
    "collectionId" TEXT,
    "isCollectionHero" BOOLEAN NOT NULL DEFAULT false,
    "delisted" BOOLEAN NOT NULL DEFAULT false,
    "appealStatus" TEXT NOT NULL DEFAULT 'none',
    "mintTxHash" TEXT,
    "contractAddress" TEXT,
    "tokenId" TEXT,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "follows" INTEGER NOT NULL DEFAULT 0,
    "dwellMsTotal" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewers" INTEGER NOT NULL DEFAULT 0,
    "impressionsToday" INTEGER NOT NULL DEFAULT 0,
    "impressionsThisWeek" INTEGER NOT NULL DEFAULT 0,
    "reportRate" REAL NOT NULL DEFAULT 0,
    "nominationScore" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Listing_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Listing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "heroListingId" TEXT,
    "sampleIdsJson" TEXT NOT NULL DEFAULT '[]',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Collection_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "curatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shelf_curatorId_fkey" FOREIGN KEY ("curatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShelfItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shelfId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShelfItem_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShelfItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShelfFollow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shelfId" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    CONSTRAINT "ShelfFollow_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'artist',
    CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Follow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Appeal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appeal_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Nomination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "nominatorId" TEXT NOT NULL,
    "stakePoints" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT,
    CONSTRAINT "Nomination_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Nomination_nominatorId_fkey" FOREIGN KEY ("nominatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "listingId" TEXT,
    "creatorId" TEXT,
    "viewerId" TEXT,
    "emerging" BOOLEAN NOT NULL DEFAULT false,
    "bucket" TEXT,
    "dwellMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "SignalEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SignalEvent_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amountUsd" REAL NOT NULL,
    "isFirst" BOOLEAN NOT NULL DEFAULT false,
    "txHash" TEXT,
    "chain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Purchase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Purchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetricCounter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" REAL NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_chain_address_key" ON "Wallet"("chain", "address");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_chain_address_key" ON "AuthNonce"("chain", "address");

-- CreateIndex
CREATE INDEX "Listing_creatorId_idx" ON "Listing"("creatorId");

-- CreateIndex
CREATE INDEX "Listing_stage_idx" ON "Listing"("stage");

-- CreateIndex
CREATE INDEX "Listing_chain_idx" ON "Listing"("chain");

-- CreateIndex
CREATE INDEX "Listing_mediaHash_idx" ON "Listing"("mediaHash");

-- CreateIndex
CREATE UNIQUE INDEX "ShelfItem_shelfId_listingId_key" ON "ShelfItem"("shelfId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "ShelfFollow_shelfId_followerId_key" ON "ShelfFollow"("shelfId", "followerId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followeeId_kind_key" ON "Follow"("followerId", "followeeId", "kind");

-- CreateIndex
CREATE INDEX "Nomination_listingId_idx" ON "Nomination"("listingId");

-- CreateIndex
CREATE INDEX "SignalEvent_type_createdAt_idx" ON "SignalEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SignalEvent_listingId_idx" ON "SignalEvent"("listingId");
