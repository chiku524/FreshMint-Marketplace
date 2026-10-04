import Link from "next/link";

export function OpenLaneFilters({
  chain,
  network,
  q,
  type,
  medium,
  minPrice,
  maxPrice,
  saleMode,
  endingSoon,
}: {
  chain?: string;
  network?: string;
  q?: string;
  type?: string;
  medium?: string;
  minPrice?: string;
  maxPrice?: string;
  saleMode?: string;
  endingSoon?: string;
}) {
  const base = "/open";
  const link = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = {
      chain,
      network,
      q,
      type,
      medium,
      minPrice,
      maxPrice,
      saleMode,
      endingSoon,
      ...params,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="lane-filters">
      <div className="lane-filters__chips">
        <Link className="badge" href={link({ chain: undefined, network: undefined })}>
          All chains
        </Link>
        <Link className="badge" href={link({ chain: "evm", network: undefined })}>
          EVM
        </Link>
        <Link className="badge" href={link({ chain: "solana", network: "solana" })}>
          Solana
        </Link>
        <Link className="badge" href={link({ chain: "boing", network: "boing" })}>
          Boing
        </Link>
        <Link className="badge" href={link({ network: "ethereum", chain: "evm" })}>
          Ethereum
        </Link>
        <Link className="badge" href={link({ network: "base", chain: "evm" })}>
          Base
        </Link>
        <Link className="badge" href={link({ network: "arbitrum", chain: "evm" })}>
          Arbitrum
        </Link>
        <Link className="badge" href={link({ network: "optimism", chain: "evm" })}>
          Optimism
        </Link>
        <Link className="badge" href={link({ type: undefined })}>
          All types
        </Link>
        <Link className="badge" href={link({ type: "single" })}>
          1/1
        </Link>
        <Link className="badge" href={link({ type: "open_edition" })}>
          Open edition
        </Link>
        <Link className="badge" href={link({ type: "auction" })}>
          Timed drop
        </Link>
        <Link className="badge" href={link({ type: "collection" })}>
          Collection
        </Link>
        <Link className="badge" href={link({ medium: "digital_ink" })}>
          Digital ink
        </Link>
        <Link className="badge" href={link({ medium: "generative" })}>
          Generative
        </Link>
        <Link className="badge" href={link({ medium: undefined })}>
          Any medium
        </Link>
        <Link className="badge" href={link({ maxPrice: "100", minPrice: undefined })}>
          Under $100
        </Link>
        <Link className="badge" href={link({ minPrice: "100", maxPrice: undefined })}>
          $100+
        </Link>
        <Link className="badge" href={link({ saleMode: undefined })}>
          Any sale mode
        </Link>
        <Link className="badge" href={link({ saleMode: "fixed" })}>
          Fixed price
        </Link>
        <Link className="badge" href={link({ saleMode: "timed_window" })}>
          Timed window
        </Link>
        <Link className="badge" href={link({ saleMode: "english" })}>
          English auction
        </Link>
        <Link
          className="badge"
          href={link({
            endingSoon: endingSoon === "1" ? undefined : "1",
            type: endingSoon === "1" ? type : type ?? "auction",
          })}
        >
          {endingSoon === "1" ? "Clear ending soon" : "Ending soon"}
        </Link>
      </div>
      <form action="/open" className="lane-filters__search">
        <input type="hidden" name="chain" value={chain ?? ""} />
        <input type="hidden" name="network" value={network ?? ""} />
        <input type="hidden" name="type" value={type ?? ""} />
        <input type="hidden" name="medium" value={medium ?? ""} />
        <input type="hidden" name="minPrice" value={minPrice ?? ""} />
        <input type="hidden" name="maxPrice" value={maxPrice ?? ""} />
        <input type="hidden" name="saleMode" value={saleMode ?? ""} />
        <input type="hidden" name="endingSoon" value={endingSoon ?? ""} />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search titles…"
          className="fm-field"
        />
        <button type="submit" className="fm-btn fm-btn--ghost">
          Apply
        </button>
      </form>
    </div>
  );
}
