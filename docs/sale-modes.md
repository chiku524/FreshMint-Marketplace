# Sale modes, English auction, collection packages

## `type` vs `saleMode`

| Creator sale mode | `saleMode` | Discovery `type` | Checkout |
|---|---|---|---|
| Fixed price | `fixed` | `single` / `collection` / `open_edition` | Always-on list price |
| Timed window | `timed_window` | `auction` | Buy at list price while window open |
| English auction | `english` | `auction` | Open USD bidding; winner claims at high bid |

Legacy `type === "auction"` with missing `saleMode` resolves to **`timed_window`**.

`type` stays `auction` for both timed window and English so Timed drops discovery keeps working. Badges use `saleMode`.

## English auction MVP

- In-app USD bids (`Bid` rows). No on-chain English auction contracts.
- Min increment: `max($1, 5% of current high)`.
- After end + reserve met: high bidder checks out via existing crypto purchase at winning `amountUsd`.
- Reserve not met: no claim; listing remains unsold.

## Collection package sell

- Creator: `packageSellEnabled` + optional `packagePriceUsd` (default = sum of remaining primary prices).
- Eligibility: ≥2 listings, minted, unsold, not delisted, same collection, **same network**.
- Flow: one `PackagePurchase` + N `Purchase` rows; pay total once; sequential escrow transfers (resume via existing purchase lifecycle).
- **Cross-chain / bridge-for-N is out of scope** (`same_network_only`).
