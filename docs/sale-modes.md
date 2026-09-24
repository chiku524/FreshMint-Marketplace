# Sale modes, English auction, collection packages

## `type` vs `saleMode`

| Creator sale mode | `saleMode` | Discovery `type` | Checkout |
|---|---|---|---|
| Fixed price | `fixed` | `single` / `collection` / `open_edition` | Always-on list price |
| Timed window | `timed_window` | `auction` | Buy at list price while window open |
| English auction | `english` | `auction` | Open USD bidding; winner settles at high bid |

Legacy `type === "auction"` with missing `saleMode` resolves to **`timed_window`**.

`type` stays `auction` for both timed window and English so Timed drops discovery keeps working. Badges use `saleMode`.

## English auction

- In-app USD bids (`Bid` rows). No on-chain English auction contracts.
- Min increment: `max($1, 5% of current high)`.
- **Lazy settle (cron-less):** on listing view or `GET /api/listings/:id/bids` after the window ends:
  - Reserve met → mark awarded and create a `pending_payment` purchase for `highBidderId` at `currentHighBidUsd` (wallet still required to pay / bridge). Detected via `txHash` prefix `english-award:` (no schema column).
  - **Winner payment deadline:** 48h from award (`ENGLISH_WINNER_PAYMENT_DEADLINE_MS`). Ordinary checkouts still use the 15m pending TTL; English awards hold supply for 48h.
  - **On expiry:** cancel the stale `pending_payment`, then cascade to the next-highest bidder whose best bid meets reserve; if none, mark unsold (`payment_expired_unsold`).
  - Reserve not met → unsold; creator can relist or switch sale mode via the sale-mode editor.
- BidPanel: winner sees countdown + “complete payment”; creator sees awaiting payment / passed to runner-up / unsold with relist; others see sold / reserve-not-met.
- Listing buy CTA uses the winning bid amount for the winner and surfaces Resume when a pending purchase exists.
- No in-app notification system exists yet — winners are notified only via BidPanel / listing CTA on view (no email).


## Collection package sell

- Creator: `packageSellEnabled` + optional `packagePriceUsd` (default = sum of remaining primary prices).
- Eligibility: ≥2 listings, minted, unsold, not delisted, same collection, **same listing network** (receive chain is one network).
- Flow: one `PackagePurchase` + N `Purchase` rows; pay package total once; sequential escrow transfers (resume via existing purchase lifecycle).
- **Cross-chain pay:** buyer may choose a Relay `payNetwork` different from the listing network. One bridge leg covers the package total, then same-chain NFT transfers. CollectionPackagePanel fetches a live Relay quote (best-effort `feeUsd` via BridgeQuoteSummary; no polling). `simulate` is an explicit fallback only. Per-item multi-leg bridges are out of scope. Boing remains same-chain only (`assertCryptoPayAllowed`).
