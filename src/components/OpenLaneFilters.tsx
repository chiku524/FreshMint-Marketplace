import Link from "next/link";

export function OpenLaneFilters({
  chain,
  q,
  type,
  medium,
  minPrice,
  maxPrice,
}: {
  chain?: string;
  q?: string;
  type?: string;
  medium?: string;
  minPrice?: string;
  maxPrice?: string;
}) {
  const base = "/open";
  const link = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { chain, q, type, medium, minPrice, maxPrice, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <Link className="badge" href={link({ chain: undefined })}>
          All chains
        </Link>
        <Link className="badge" href={link({ chain: "evm" })}>
          EVM
        </Link>
        <Link className="badge" href={link({ chain: "solana" })}>
          Solana
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
          Auction
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
        <Link className="badge" href={link({ maxPrice: "100" })}>
          Under $100
        </Link>
        <Link className="badge" href={link({ minPrice: "100" })}>
          $100+
        </Link>
      </div>
      <form
        action="/open"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}
      >
        {chain ? <input type="hidden" name="chain" value={chain} /> : null}
        {type ? <input type="hidden" name="type" value={type} /> : null}
        {medium ? <input type="hidden" name="medium" value={medium} /> : null}
        {minPrice ? (
          <input type="hidden" name="minPrice" value={minPrice} />
        ) : null}
        {maxPrice ? (
          <input type="hidden" name="maxPrice" value={maxPrice} />
        ) : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search style, title…"
          style={{
            background: "rgba(12,31,26,0.65)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
            padding: "0.35rem 0.6rem",
            minWidth: "12rem",
          }}
        />
        <button
          type="submit"
          className="badge"
          style={{ cursor: "pointer", background: "transparent" }}
        >
          Search
        </button>
      </form>
    </div>
  );
}
