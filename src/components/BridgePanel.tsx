"use client";

import { sendEvmWalletTx } from "@/lib/onchain/wallet-client";
import { useEffect, useState, type CSSProperties } from "react";

type NetworkOption = {
  id: string;
  label: string;
  nativeSymbol: string;
  vm: string;
  relayChainId: number;
};

export function BridgePanel() {
  const [networks, setNetworks] = useState<NetworkOption[]>([]);
  const [fromNetwork, setFrom] = useState("base");
  const [toNetwork, setTo] = useState("solana");
  const [amount, setAmount] = useState("0.01");
  const [userAddress, setUserAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    estimatedOutput?: string;
    feeUsd?: string;
    requestId?: string;
  } | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/bridge/networks")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.networks)) setNetworks(d.networks);
      })
      .catch(() => undefined);
  }, []);

  async function connectEvm() {
    const eth = (
      window as unknown as {
        ethereum?: { request: (a: { method: string }) => Promise<string[]> };
      }
    ).ethereum;
    if (!eth) throw new Error("Connect MetaMask for EVM legs");
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts[0]) throw new Error("no_account");
    setUserAddress(accounts[0]);
    return accounts[0];
  }

  async function connectSol() {
    const sol = (
      window as unknown as {
        solana?: {
          connect: () => Promise<{ publicKey: { toString: () => string } }>;
        };
      }
    ).solana;
    if (!sol) throw new Error("Connect Phantom for Solana legs");
    const { publicKey } = await sol.connect();
    const addr = publicKey.toString();
    setUserAddress(addr);
    return addr;
  }

  async function ensureAddress(fromVm: string) {
    if (userAddress) return userAddress;
    return fromVm === "solana" ? connectSol() : connectEvm();
  }

  async function onQuote() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const from = networks.find((n) => n.id === fromNetwork);
      const address = await ensureAddress(from?.vm ?? "evm");
      const res = await fetch("/api/bridge/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromNetwork,
          toNetwork,
          amount,
          userAddress: address,
          recipientAddress: recipient || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "quote_failed");
      setQuote(data.quote);
      setTransferId(data.transferId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "quote_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onExecute() {
    setBusy(true);
    setError(null);
    try {
      const from = networks.find((n) => n.id === fromNetwork);
      const address = await ensureAddress(from?.vm ?? "evm");
      const res = await fetch("/api/bridge/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromNetwork,
          toNetwork,
          amount,
          userAddress: address,
          recipientAddress: recipient || undefined,
          transferId: transferId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "prepare_failed");

      const hashes: string[] = [];
      for (const step of data.walletSteps ?? []) {
        if (step.chain === "evm" && step.to && step.data) {
          const hash = await sendEvmWalletTx({
            chain: "evm",
            chainId: step.chainId,
            to: step.to,
            data: step.data,
            value: step.value ?? "0x0",
            from: address,
          });
          hashes.push(hash);
        }
      }

      const confirm = await fetch("/api/bridge/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferId: transferId ?? undefined,
          requestId: data.requestId ?? data.quote?.requestId,
          txHashes: hashes,
        }),
      });
      const conf = await confirm.json();
      if (!confirm.ok) throw new Error(conf.error ?? "confirm_failed");
      setStatus(conf.status ?? "submitted");
      setQuote(data.quote);
    } catch (e) {
      setError(e instanceof Error ? e.message : "execute_failed");
    } finally {
      setBusy(false);
    }
  }

  const field: CSSProperties = {
    width: "100%",
    marginTop: "0.35rem",
    padding: "0.55rem 0.65rem",
    background: "var(--panel-solid)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  };

  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        maxWidth: "32rem",
        padding: "1.25rem",
        border: "1px solid var(--line)",
        background: "var(--panel)",
      }}
    >
      <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.95rem" }}>
        Move native gas (ETH on Ethereum / Base / Arbitrum / Optimism, or SOL)
        across mint-supported networks via Relay. Testnet mode until mainnet
        wallets are funded.
      </p>

      <label>
        From
        <select
          value={fromNetwork}
          onChange={(e) => setFrom(e.target.value)}
          style={field}
        >
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} ({n.nativeSymbol})
            </option>
          ))}
        </select>
      </label>

      <label>
        To
        <select
          value={toNetwork}
          onChange={(e) => setTo(e.target.value)}
          style={field}
        >
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} ({n.nativeSymbol})
            </option>
          ))}
        </select>
      </label>

      <label>
        Amount (native units)
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={field}
        />
      </label>

      <label>
        Your address (auto-filled on connect)
        <input
          value={userAddress}
          onChange={(e) => setUserAddress(e.target.value)}
          style={field}
          placeholder="0x… or Solana pubkey"
        />
      </label>

      <label>
        Recipient (optional)
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          style={field}
          placeholder="Defaults to your address"
        />
      </label>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="badge featured"
          disabled={busy}
          onClick={() => void onQuote()}
          style={{ cursor: "pointer", background: "transparent", padding: "0.5rem 0.85rem" }}
        >
          {busy ? "…" : "Get quote"}
        </button>
        <button
          type="button"
          className="badge emerging"
          disabled={busy || !quote}
          onClick={() => void onExecute()}
          style={{ cursor: "pointer", background: "transparent", padding: "0.5rem 0.85rem" }}
        >
          Execute bridge
        </button>
      </div>

      {quote ? (
        <div style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          {quote.estimatedOutput ? (
            <div>Est. output: {quote.estimatedOutput}</div>
          ) : null}
          {quote.feeUsd ? <div>Fee ≈ ${quote.feeUsd}</div> : null}
          {quote.requestId ? (
            <div style={{ wordBreak: "break-all" }}>
              Request: {quote.requestId}
            </div>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p style={{ margin: 0, color: "var(--emergent)" }}>Status: {status}</p>
      ) : null}
      {error ? (
        <p style={{ margin: 0, color: "var(--danger)" }}>{error}</p>
      ) : null}
    </div>
  );
}
