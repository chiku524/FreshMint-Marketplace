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
  - Reserve met → mark awarded and create a `pending_payment` purchase for `highBidderId` at `currentHighBidUsd` (wallet still required to pay / bridge).
  - Reserve not met → unsold; creator can relist or switch sale mode via the sale-mode editor.
- BidPanel: winner sees “You won — complete payment”; others see sold / reserve-not-met.
- Listing buy CTA uses the winning bid amount for the winner and surfaces Resume when a pending purchase exists.

## Collection package sell

- Creator: `packageSellEnabled` + optional `packagePriceUsd` (default = sum of remaining primary prices).
- Eligibility: ≥2 listings, minted, unsold, not delisted, same collection, **same listing network** (receive chain is one network).
- Flow: one `PackagePurchase` + N `Purchase` rows; pay package total once; sequential escrow transfers (resume via existing purchase lifecycle).
- **Cross-chain pay:** buyer may choose a Relay `payNetwork` different from the listing network. One bridge leg covers the package total, then same-chain NFT transfers. Per-item multi-leg bridges are out of scope. Boing remains same-chain only (`assertCryptoPayAllowed`).
