"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Eligibility = {
  ok: boolean;
  reason?: string;
  listings?: { id: string; title: string; priceUsd: number }[];
  defaultPriceUsd?: number;
  network?: string | null;
  packageSellEnabled?: boolean;
  packagePriceUsd?: number | null;
  payNetworks?: string[];
};

const PAY_LABELS: Record<string, string> = {
  ethereum: "Ethereum (ETH)",
  base: "Base (ETH)",
  arbitrum: "Arbitrum (ETH)",
  optimism: "Optimism (ETH)",
  solana: "Solana (SOL)",
  boing: "Boing (BOING)",
};

export function CollectionPackagePanel({
  collectionId,
  isOwner,
}: {
  collectionId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<Eligibility | null>(null);
  const [price, setPrice] = useState("");
  const [payNetwork, setPayNetwork] = useState("ethereum");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    void fetch(`/api/collections/${collectionId}/package`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Eligibility | null) => {
        if (!d) return;
        setData(d);
        setPrice(String(d.packagePriceUsd ?? d.defaultPriceUsd ?? ""));
        const nets = d.payNetworks?.length
          ? d.payNetworks
          : d.network
            ? [d.network]
            : ["ethereum"];
        setPayNetwork(nets[0]!);
      })
      .catch(() => setData(null));
  }

  useEffect(() => {
    load();
  }, [collectionId]);

  if (!data) return null;
  const count = data.listings?.length ?? 0;
  if (!isOwner && (!data.packageSellEnabled || count < 2)) return null;

  const payNetworks =
    data.payNetworks && data.payNetworks.length > 0
      ? data.payNetworks
      : data.network
        ? [data.network]
        : ["ethereum"];
  const crossChain = Boolean(data.network && payNetwork !== data.network);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/package`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageSellEnabled: enabled,
          packagePriceUsd: price ? Number(price) : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "update_failed");
      setMsg(enabled ? "Package sell enabled" : "Package sell disabled");
      load();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/package`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payNetwork,
          buyerPaymentAddress: "0xbuyer",
          buyerReceiveAddress: "0xbuyer",
          simulate: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "buy_failed");
      const bridgeNote = body.bridged
        ? " One Relay bridge for the package total, then same-chain NFT transfers."
        : " Same-network checkout.";
      setMsg(
        `Package prepared (${body.purchaseIds?.length ?? 0} works, $${body.amountUsd}).${bridgeNote}`,
      );
      load();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "buy_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        margin: "1.25rem 0 1.75rem",
        border: "1px solid var(--line)",
        padding: "1rem 1.1rem",
        background: "var(--panel)",
        maxWidth: "36rem",
      }}
    >
      <h2 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1.2rem" }}>
        Remaining works package
      </h2>
      <p style={{ margin: "0 0 0.75rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        {count} unsold minted works
        {data.defaultPriceUsd != null ? ` · default $${data.defaultPriceUsd}` : ""}
        {data.network ? ` · receive on ${data.network}` : ""}.
        Pay on the listing network or bridge once via Relay for the package total.
      </p>
      {isOwner ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem" }}>
            Package price USD
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ display: "block", marginTop: 4, width: "8rem" }}
            />
          </label>
          <button
            type="button"
            className="badge featured"
            disabled={busy || count < 2}
            style={{ cursor: "pointer", background: "transparent" }}
            onClick={() => void toggle(!data.packageSellEnabled)}
          >
            {data.packageSellEnabled ? "Disable package sell" : "Sell remaining as package"}
          </button>
        </div>
      ) : null}
      {!isOwner && data.packageSellEnabled && count >= 2 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem" }}>
            Pay from
            <select
              value={payNetwork}
              onChange={(e) => setPayNetwork(e.target.value)}
              style={{ display: "block", marginTop: 4, minWidth: "10rem" }}
            >
              {payNetworks.map((n) => (
                <option key={n} value={n}>
                  {PAY_LABELS[n] ?? n}
                  {data.network && n === data.network ? " (listing)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="badge featured"
            disabled={busy}
            style={{ cursor: "pointer", background: "transparent" }}
            onClick={() => void buy()}
          >
            {crossChain
              ? `Bridge & buy package ($${price || data.defaultPriceUsd})`
              : `Buy remaining works ($${price || data.defaultPriceUsd})`}
          </button>
        </div>
      ) : null}
      {msg ? (
        <p style={{ margin: "0.55rem 0 0", fontSize: "0.85rem", color: "var(--ink-muted)" }}>
          {msg}
        </p>
      ) : null}
    </section>
  );
}
