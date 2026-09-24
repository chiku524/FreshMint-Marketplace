# In-app notifications

FreshMint uses an in-app inbox only (no email / push providers).

## Model

`Notification`: `userId`, `type`, `title`, `body`, `payloadJson`, `href`, `dedupeKey`, `readAt`, `createdAt`.

Idempotency: unique `(userId, dedupeKey)` — repeated lazy settles / cron runs do not duplicate.

## Types

| type | Who | When |
|---|---|---|
| `english_win` | Winner | Award created with 48h pay-by |
| `english_cascade` | Runner-up | Prior winner payment expired |
| `english_expired` | Lapsed winner | Their pending award cancelled |
| `english_outbid` | Previous high bidder | New higher bid |
| `creator_english_awaiting` | Creator | Award pending payment |
| `creator_english_sold` | Creator | English award purchase completed |
| `creator_english_unsold` | Creator | Ended unsold / payment cascade exhausted |
| `item_sold` | Creator | Non-English purchase completed |
| `package_sold` | Creator | Collection package purchase created |

## APIs (auth required)

- `GET /api/notifications?limit=&cursor=&unreadOnly=1`
- `GET /api/notifications/unread-count`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`
- `PATCH /api/notifications` with `{ markAllRead: true }` or `{ id }`

## UI

Bell + unread badge in account nav; `/notifications` full inbox.
