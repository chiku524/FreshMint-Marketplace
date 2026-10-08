# Collection name uniqueness

Collection **display names** (`Collection.title`) are unique across the entire FreshMint Marketplace — not scoped by network, chain, or creator.

## Policy

| Rule | Detail |
|---|---|
| Scope | Global (all networks) |
| Case | **Case-insensitive** — `Dawn Set` and `dawn set` collide |
| Whitespace | Leading/trailing trim; internal runs of whitespace collapse to a single space |
| Display | Creators keep their chosen casing in `title`; uniqueness uses `titleNormalized` |
| URL slug | Separate from the name (`slug`); both must be unique |

Canonical form (TypeScript: `normalizeCollectionTitle`):

```text
lower(trim(collapse_whitespace(title)))
```

## Enforcement

1. **Database** — unique index on `Collection.titleNormalized` (migration `20261004093000_collection_title_normalized`).
2. **API** — `POST /api/collections` rejects with `title_taken` / `invalid_title_*` before insert; unique violations map to `title_taken`.
3. **Live check** — `GET /api/collections/name-check?title=…` for the create wizard (same pattern as slug-check).

## Soft-hold until on-chain deploy confirms

Creating a collection inserts a draft row (`deployStatus: pending_wallet`) so the wallet deploy intent can reference a stable id. That row **soft-holds** the unique `titleNormalized` / `slug` only while deploy is in flight.

| Event | Name/slug hold |
|---|---|
| Wallet reject / cancel / failed send | Released immediately (`POST …/deploy` `action: "abandon"`) |
| Mempool accepted but sync still indexing | Hold kept so heal/sync can confirm |
| Confirmed on-chain | Hold becomes permanent (real contract) |
| Creator retries same title/slug | Own unconfirmed draft is reclaimed, then create proceeds |
| Abandoned draft older than 2h, never deployed, no minted listings | Age cleanup frees the hold |

`releaseCollectionNameHold` only deletes when the collection is **not** deploy-ready and has no minted/live listings. Confirmed contracts and minted NFTs are never removed.

## Migration / existing duplicates

The migration backfills `titleNormalized`, then **aborts** if any case-insensitive duplicate groups exist. It does not auto-rename or delete production rows.

If migrate fails with `collection_title_unique_blocked`:

1. Inspect listed `titleNormalized` groups and collection ids.
2. Rename or archive extras so one row owns each normalized name.
3. Re-run `prisma migrate deploy` (or the app `db:migrate-deploy` script).

Empty databases and installs without duplicates apply cleanly.
