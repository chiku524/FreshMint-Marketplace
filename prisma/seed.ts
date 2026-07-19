import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ssl:
      connectionString.includes("sslmode=require") ||
      connectionString.includes("prisma.io")
        ? { rejectUnauthorized: false }
        : undefined,
  }),
});
const day = 24 * 60 * 60 * 1000;
const now = Date.now();

async function main() {
  await prisma.signalEvent.deleteMany();
  await prisma.moderationAction.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.nomination.deleteMany();
  await prisma.appeal.deleteMany();
  await prisma.report.deleteMany();
  await prisma.shelfFollow.deleteMany();
  await prisma.shelfItem.deleteMany();
  await prisma.shelf.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authNonce.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();

  const nova = await prisma.user.create({
    data: {
      id: "artist-nova",
      displayName: "Nova Ink",
      firstListingAt: new Date(now - 20 * day),
      lifetimePrimaryVolumeUsd: 420,
      completedSales: 2,
      walletCreatedAt: new Date(now - 60 * day),
      risingEntriesThisWeek: 1,
      openLaneListingsToday: 2,
      curatorScore: 40,
      wallets: {
        create: [
          {
            chain: "evm",
            address: "0xnova0000000000000000000000000000000001",
          },
          {
            chain: "solana",
            address: "NovaSol1111111111111111111111111111111",
          },
        ],
      },
    },
  });

  const glitch = await prisma.user.create({
    data: {
      id: "artist-glitch",
      displayName: "Glitch Petal",
      firstListingAt: new Date(now - 10 * day),
      lifetimePrimaryVolumeUsd: 80,
      completedSales: 0,
      walletCreatedAt: new Date(now - 40 * day),
      risingEntriesThisWeek: 0,
      openLaneListingsToday: 1,
      curatorScore: 25,
      wallets: {
        create: [
          {
            chain: "solana",
            address: "GlitchPetal222222222222222222222222222",
          },
        ],
      },
    },
  });

  const whale = await prisma.user.create({
    data: {
      id: "artist-whale",
      displayName: "Atelier Whale",
      firstListingAt: new Date(now - 400 * day),
      lifetimePrimaryVolumeUsd: 250_000,
      completedSales: 180,
      verifiedCreator: true,
      establishedBadge: true,
      walletCreatedAt: new Date(now - 800 * day),
      curatorScore: 120,
      wallets: {
        create: [
          {
            chain: "evm",
            address: "0xwhale00000000000000000000000000000001",
          },
        ],
      },
    },
  });

  const fresh = await prisma.user.create({
    data: {
      id: "artist-fresh",
      displayName: "Fresh Paper",
      firstListingAt: new Date(now - 2 * day),
      lifetimePrimaryVolumeUsd: 0,
      completedSales: 0,
      walletCreatedAt: new Date(now - 10 * day),
      curatorScore: 10,
      wallets: {
        create: [
          {
            chain: "evm",
            address: "0xfresh00000000000000000000000000000001",
          },
        ],
      },
    },
  });

  const mira = await prisma.user.create({
    data: {
      id: "collector-mira",
      displayName: "Mira Collects",
      walletCreatedAt: new Date(now - 200 * day),
      curatorScore: 55,
      wallets: {
        create: [
          {
            chain: "evm",
            address: "0xmira0000000000000000000000000000000001",
          },
        ],
      },
    },
  });

  // Guest curators for cold start
  const guest = await prisma.user.create({
    data: {
      id: "curator-guest",
      displayName: "Guest Atelier",
      walletCreatedAt: new Date(now - 300 * day),
      curatorScore: 80,
      role: "editor",
      wallets: {
        create: [
          {
            chain: "solana",
            address: "GuestCurator33333333333333333333333333",
          },
        ],
      },
    },
  });

  await prisma.user.create({
    data: {
      id: "mod-ops",
      displayName: "Ops Moderator",
      walletCreatedAt: new Date(now - 500 * day),
      curatorScore: 100,
      role: "moderator",
      wallets: {
        create: [
          {
            chain: "evm",
            address: "0xmod00000000000000000000000000000000001",
          },
        ],
      },
    },
  });

  void whale;
  void fresh;

  const collection = await prisma.collection.create({
    data: {
      id: "col-static-garden",
      title: "Static Garden",
      creatorId: glitch.id,
      chain: "solana",
      totalItems: 3,
      sampleIdsJson: "[]",
    },
  });

  const listings = await Promise.all([
    prisma.listing.create({
      data: {
        id: "listing-nova-1",
        title: "Cyan Orbit",
        description: "Ink study of orbital quiet.",
        creatorId: nova.id,
        type: "single",
        chain: "evm",
        stage: "rising_eligible",
        priceUsd: 120,
        medium: "digital_ink",
        styleTagsJson: JSON.stringify(["ink", "minimal"]),
        mediaHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
        softLaunchedAt: new Date(now - 17 * day),
        risingEligibleAt: new Date(now - 16 * day),
        saves: 12,
        follows: 4,
        dwellMsTotal: 90_000,
        uniqueViewers: 40,
        impressionsToday: 120,
        impressionsThisWeek: 400,
        nominationScore: 2,
        mintTxHash: "0xseednova1",
        contractAddress: "0xFMseed0001",
        tokenId: "1",
      },
    }),
    prisma.listing.create({
      data: {
        id: "listing-glitch-oe",
        title: "Petal Static OE",
        description: "Open edition glitch blooms.",
        creatorId: glitch.id,
        type: "open_edition",
        chain: "solana",
        stage: "rising_eligible",
        priceUsd: 25,
        medium: "generative",
        styleTagsJson: JSON.stringify(["glitch", "floral"]),
        mediaHash: "f0e1d2c3b4a5968778695a4b3c2d1e0f",
        softLaunchedAt: new Date(now - 4 * day),
        risingEligibleAt: new Date(now - 3 * day),
        oeStartsAt: new Date(now - 2 * 60 * 60 * 1000),
        oeEndsAt: new Date(now + 22 * 60 * 60 * 1000),
        saves: 8,
        uniqueViewers: 55,
        impressionsToday: 300,
        impressionsThisWeek: 500,
        mintTxHash: "seedglitchoe",
        contractAddress: "FMOeSeed2222",
        tokenId: "oe-1",
      },
    }),
    prisma.listing.create({
      data: {
        id: "listing-whale-featured",
        title: "Cathedral Signal",
        description: "Established series centerpiece.",
        creatorId: whale.id,
        type: "single",
        chain: "evm",
        stage: "featured",
        priceUsd: 4200,
        medium: "3d",
        styleTagsJson: JSON.stringify(["architecture", "light"]),
        mediaHash: "11223344556677889900aabbccddeeff",
        softLaunchedAt: new Date(now - 99 * day),
        risingEligibleAt: new Date(now - 98 * day),
        featuredAt: new Date(now - 2 * day),
        saves: 200,
        follows: 80,
        dwellMsTotal: 500_000,
        uniqueViewers: 2000,
        impressionsToday: 5000,
        impressionsThisWeek: 20_000,
        nominationScore: 10,
      },
    }),
    prisma.listing.create({
      data: {
        id: "listing-fresh-1",
        title: "First Fold",
        description: "Paper study number one.",
        creatorId: fresh.id,
        type: "single",
        chain: "evm",
        stage: "rising_eligible",
        priceUsd: 45,
        medium: "collage",
        styleTagsJson: JSON.stringify(["paper", "soft"]),
        mediaHash: "99887766554433221100ffeeddccbbaa",
        softLaunchedAt: new Date(now - 2 * day),
        risingEligibleAt: new Date(now - 1 * day),
        saves: 3,
        uniqueViewers: 12,
        dwellMsTotal: 20_000,
        impressionsToday: 40,
        impressionsThisWeek: 40,
      },
    }),
    prisma.listing.create({
      data: {
        id: "listing-nova-auction",
        title: "Night Transit",
        description: "Auction for a nocturnal ink piece.",
        creatorId: nova.id,
        type: "auction",
        chain: "solana",
        stage: "rising_eligible",
        medium: "digital_ink",
        styleTagsJson: JSON.stringify(["ink", "night"]),
        mediaHash: "abcdef0123456789fedcba9876543210",
        softLaunchedAt: new Date(now - 6 * day),
        risingEligibleAt: new Date(now - 5 * day),
        auctionStartsAt: new Date(now - 60 * 60 * 1000),
        auctionEndsAt: new Date(now + 3 * 60 * 60 * 1000),
        saves: 6,
        uniqueViewers: 30,
        impressionsToday: 90,
        impressionsThisWeek: 200,
      },
    }),
    prisma.listing.create({
      data: {
        id: "listing-fresh-sold-auction",
        title: "First Frost Plate",
        description: "Successfully cleared auction — early paper study.",
        creatorId: fresh.id,
        type: "auction",
        chain: "evm",
        stage: "featured",
        priceUsd: 180,
        medium: "digital_ink",
        styleTagsJson: JSON.stringify(["paper", "frost"]),
        mediaHash: "soldfreshauction001hash0123456789ab",
        softLaunchedAt: new Date(now - 11 * day),
        risingEligibleAt: new Date(now - 10 * day),
        featuredAt: new Date(now - 3 * day),
        auctionStartsAt: new Date(now - 5 * day),
        auctionEndsAt: new Date(now - 2 * day),
        saves: 11,
        uniqueViewers: 48,
        impressionsThisWeek: 160,
        nominationScore: 2,
      },
    }),
    prisma.listing.create({
      data: {
        id: "listing-glitch-sold-auction",
        title: "Petal Static #7",
        description: "Cleared auction from the Static Garden series.",
        creatorId: glitch.id,
        type: "auction",
        chain: "solana",
        stage: "rising_eligible",
        priceUsd: 95,
        medium: "generative",
        styleTagsJson: JSON.stringify(["glitch", "petal"]),
        mediaHash: "soldglitchauction002hash0123456789",
        softLaunchedAt: new Date(now - 13 * day),
        risingEligibleAt: new Date(now - 12 * day),
        auctionStartsAt: new Date(now - 9 * day),
        auctionEndsAt: new Date(now - 6 * day),
        saves: 8,
        uniqueViewers: 36,
        impressionsThisWeek: 120,
      },
    }),
  ]);

  const hero = await prisma.listing.create({
    data: {
      id: "listing-glitch-col-hero",
      title: "Static Garden Hero",
      description: "Collection hero.",
      creatorId: glitch.id,
      type: "collection",
      chain: "solana",
      stage: "soft_launch",
      priceUsd: 60,
      medium: "generative",
      styleTagsJson: JSON.stringify(["glitch"]),
      mediaHash: "deadbeefcafebabe0123456789abcdef",
      softLaunchedAt: new Date(now - 3 * day),
      collectionId: collection.id,
      isCollectionHero: true,
      uniqueViewers: 8,
    },
  });
  const s2 = await prisma.listing.create({
    data: {
      id: "listing-glitch-col-2",
      title: "Static Garden #2",
      description: "Sample two.",
      creatorId: glitch.id,
      type: "collection",
      chain: "solana",
      stage: "soft_launch",
      priceUsd: 60,
      medium: "generative",
      styleTagsJson: JSON.stringify(["glitch"]),
      mediaHash: "deadbeefcafebabf0123456789abcdef",
      softLaunchedAt: new Date(now - 3 * day),
      collectionId: collection.id,
      uniqueViewers: 3,
    },
  });
  const s3 = await prisma.listing.create({
    data: {
      id: "listing-glitch-col-3",
      title: "Static Garden #3",
      description: "Sample three.",
      creatorId: glitch.id,
      type: "collection",
      chain: "solana",
      stage: "soft_launch",
      priceUsd: 60,
      medium: "generative",
      styleTagsJson: JSON.stringify(["glitch"]),
      mediaHash: "deadbeefcafebac00123456789abcdef",
      softLaunchedAt: new Date(now - 3 * day),
      collectionId: collection.id,
      uniqueViewers: 2,
    },
  });

  await prisma.collection.update({
    where: { id: collection.id },
    data: {
      heroListingId: hero.id,
      sampleIdsJson: JSON.stringify([s2.id, s3.id]),
      totalItems: 3,
    },
  });

  const shelf = await prisma.shelf.create({
    data: {
      id: "shelf-ink",
      name: "Ink & Quiet",
      curatorId: mira.id,
      items: {
        create: [
          { listingId: "listing-nova-1", position: 0 },
          { listingId: "listing-nova-auction", position: 1 },
        ],
      },
      followers: { create: [{ followerId: mira.id }] },
    },
  });

  await prisma.shelf.create({
    data: {
      id: "shelf-emerging",
      name: "Emerging Under $100",
      curatorId: guest.id,
      items: {
        create: [
          { listingId: "listing-fresh-1", position: 0 },
          { listingId: "listing-glitch-oe", position: 1 },
        ],
      },
      followers: { create: [{ followerId: mira.id }] },
    },
  });

  await prisma.follow.createMany({
    data: [
      { followerId: mira.id, followeeId: nova.id, kind: "artist" },
      { followerId: mira.id, followeeId: fresh.id, kind: "artist" },
    ],
  });

  await prisma.purchase.createMany({
    data: [
      {
        listingId: "listing-fresh-sold-auction",
        buyerId: mira.id,
        amountUsd: 180,
        isFirst: true,
        txHash: "0xsoldfresh001",
        chain: "evm",
        createdAt: new Date(now - 2 * day),
      },
      {
        listingId: "listing-glitch-sold-auction",
        buyerId: mira.id,
        amountUsd: 95,
        isFirst: true,
        txHash: "soldglitch002",
        chain: "solana",
        createdAt: new Date(now - 6 * day),
      },
    ],
  });

  // Seed impression signals so metrics dashboard isn't empty
  for (const listing of listings) {
    await prisma.signalEvent.create({
      data: {
        type: "impression",
        listingId: listing.id,
        creatorId: listing.creatorId,
        viewerId: mira.id,
        emerging: listing.creatorId !== whale.id,
        bucket: "emerging_rising",
      },
    });
  }

  console.log("Seeded FreshMint cold-start catalog:", {
    users: 7,
    listings: listings.length + 3,
    shelves: 2,
    shelfInk: shelf.id,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
