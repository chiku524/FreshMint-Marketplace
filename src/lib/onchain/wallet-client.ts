"use client";

/** Browser helpers for sending prepared FreshMint txs. */

export type EvmWalletTx = {
  chain: "evm";
  to: string;
  data: string;
  value?: string;
  from?: string;
};

export type SolanaWalletTx = {
  chain: "solana";
  memo?: string;
  network?: string;
};

export async function sendEvmWalletTx(tx: EvmWalletTx): Promise<string> {
  const eth = (
    window as unknown as {
      ethereum?: {
        request: (args: {
          method: string;
          params?: unknown[];
        }) => Promise<unknown>;
      };
    }
  ).ethereum;
  if (!eth) throw new Error("No EVM wallet found (MetaMask / Rabby)");

  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  const from = tx.from ?? accounts[0];
  if (!from) throw new Error("no_account");

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }], // Sepolia
    });
  } catch {
    // user may reject switch; continue
  }

  const hash = (await eth.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: tx.to,
        data: tx.data,
        value: tx.value ?? "0x0",
      },
    ],
  })) as string;
  return hash;
}

export async function sendSolanaWalletTx(
  serializedBase64: string,
): Promise<string> {
  const provider = (
    window as unknown as {
      solana?: {
        connect: () => Promise<{ publicKey: { toString: () => string } }>;
        signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>;
      };
    }
  ).solana;
  if (!provider) throw new Error("No Solana wallet found (Phantom)");

  await provider.connect();
  const { Transaction } = await import("@solana/web3.js");
  const raw = atob(serializedBase64);
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const tx = Transaction.from(bytes);
  const result = await provider.signAndSendTransaction(tx);
  return result.signature;
}

/** If create/buy returned a Solana memo intent, prepare + send via wallet. */
export async function sendSolanaMemoFromWallet(listingId: string, action: "mint" | "buy", amountUsd?: number): Promise<string> {
  const res = await fetch("/api/onchain/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId, action, amountUsd }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "prepare_failed");
  if (!data.serialized) {
    throw new Error("solana_tx_unavailable");
  }
  return sendSolanaWalletTx(data.serialized as string);
}

export async function maybeSendWalletTx(input: {
  walletTx: unknown;
  listingId: string;
  action: "mint" | "buy";
  amountUsd?: number;
}): Promise<string | null> {
  const wt = input.walletTx as
    | (EvmWalletTx & { chain: string })
    | (SolanaWalletTx & { chain: string })
    | null
    | undefined;
  if (!wt || typeof wt !== "object") return null;

  if (wt.chain === "evm" && "to" in wt && "data" in wt) {
    return sendEvmWalletTx(wt as EvmWalletTx);
  }
  if (wt.chain === "solana") {
    return sendSolanaMemoFromWallet(
      input.listingId,
      input.action,
      input.amountUsd,
    );
  }
  return null;
}
