"use client";

import { sendEvmWalletTx } from "@/lib/onchain/wallet-client";
import { BridgeQuoteSummary } from "@/components/BridgeQuoteSummary";
import { useEffect, useState } from "react";
import { toast } from "@/lib/client/toast";

function readableBridgeError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("reject") || m.includes("denied")) return "Wallet request was rejected";
  if (m.includes("insufficient")) return "Not enough funds on the source network";
  if (m.includes("amount")) return "Enter a valid amount";
  if (m.includes("address")) return "Connect a wallet or enter a valid address";
  if (/^[a-z0-9_]+$/.test(raw)) return "Bridge request failed. Please try again.";
  return raw.length > 140 ? `${raw.slice(0, 137)}\u2026` : raw;
}

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
      const text = readableBridgeError(e instanceof Error ? e.message : "quote_failed");
      setError(text);
      toast(text, "error");
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
      toast("Bridge submitted \u2014 funds usually arrive within a few minutes", "ok");
    } catch (e) {
      const text = readableBridgeError(e instanceof Error ? e.message : "execute_failed");
      setError(text);
      toast(text, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fm-form-stack bridge-shell">
      <p className="fm-form-note">
        1. Choose networks and an amount. 2. Get a quote. 3. Confirm in your
        wallet. Bridging is powered by Relay.
      </p>

      <label>
        From
        <select
          value={fromNetwork}
          onChange={(e) => setFrom(e.target.value)}
          className="fm-field"
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
          className="fm-field"
        >
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} ({n.nativeSymbol})
            </option>
          ))}
        </select>
      </label>

      <label>
        Amount ({networks.find((n) => n.id === fromNetwork)?.nativeSymbol ?? "ETH"})
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="fm-field"
          inputMode="decimal"
          autoComplete="off"
        />
      </label>

      <label>
        Your wallet address
        <input
          value={userAddress}
          onChange={(e) => setUserAddress(e.target.value)}
          className="fm-field"
          placeholder="Filled in when you connect a wallet"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label>
        Recipient (optional)
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="fm-field"
          placeholder="Defaults to your address"
        />
      </label>

      <div className="fm-form-actions">
        <button
          type="button"
          className="fm-btn fm-btn--primary"
          disabled={busy}
          onClick={() => void onQuote()}
        >
          {busy ? "Working\u2026" : quote ? "Refresh quote" : "Get quote"}
        </button>
        <button
          type="button"
          className="fm-btn fm-btn--ghost"
          disabled={busy || !quote}
          onClick={() => void onExecute()}
        >
          {quote ? "Bridge now" : "Bridge (get a quote first)"}
        </button>
      </div>

      {quote ? (
        <BridgeQuoteSummary
          feeUsd={quote.feeUsd}
          estimatedOutput={quote.estimatedOutput}
          requestId={quote.requestId}
        />
      ) : null}

      {status ? (
        <p role="status" aria-live="polite" className="fm-form-note" style={{ color: "var(--emergent)" }}>
          Bridge status: {status.replace(/_/g, " ")}
        </p>
      ) : null}
      {error ? <p role="alert" className="fm-form-error">{error}</p> : null}
    </div>
  );
}
