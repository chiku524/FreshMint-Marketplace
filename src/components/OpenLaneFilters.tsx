import Link from "next/link";

export function OpenLaneFilters({
  chain,
  q,
  type,
}: {
  chain?: string;
  q?: string;
  type?: string;
}) {
  const base = "/open";
  const link = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { chain, q, type, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
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
      <form action="/open" style={{ display: "inline-flex", gap: "0.4rem" }}>
        {chain ? <input type="hidden" name="chain" value={chain} /> : null}
        {type ? <input type="hidden" name="type" value={type} /> : null}
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
