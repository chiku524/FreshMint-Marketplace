-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
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
    "role" TEXT NOT NULL DEFAULT 'member',
    "walletCreatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("completedSales", "createdAt", "curatorScore", "displayName", "establishedBadge", "firstListingAt", "flagged", "id", "lifetimePrimaryVolumeUsd", "openLaneListingsToday", "risingEntriesThisWeek", "updatedAt", "verifiedCreator", "walletCreatedAt", "washCluster") SELECT "completedSales", "createdAt", "curatorScore", "displayName", "establishedBadge", "firstListingAt", "flagged", "id", "lifetimePrimaryVolumeUsd", "openLaneListingsToday", "risingEntriesThisWeek", "updatedAt", "verifiedCreator", "walletCreatedAt", "washCluster" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ModerationAction_targetType_targetId_idx" ON "ModerationAction"("targetType", "targetId");
