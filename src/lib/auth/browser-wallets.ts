import bs58 from "bs58";

export type BrowserWalletChain = "evm" | "solana" | "boing";

export type SignedWalletProof = {
  chain: BrowserWalletChain;
  address: string;
  signature: string;
};

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereum(): EthProvider {
  const eth = (window as unknown as { ethereum?: EthProvider }).ethereum;
  if (!eth) throw new Error("No EVM wallet found");
  return eth;
}

function getBoing(): EthProvider {
  const provider = (window as unknown as { boing?: EthProvider }).boing;
  if (!provider?.request) {
    throw new Error("No Boing Express wallet found — install Boing Express");
  }
  return provider;
}

function encodeBoingSignature(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return bs58.encode(value);
  if (value && typeof value === "object") {
    const rec = value as { signature?: unknown; result?: unknown };
    if (typeof rec.signature === "string") return rec.signature;
    if (rec.signature instanceof Uint8Array) return bs58.encode(rec.signature);
    if (typeof rec.result === "string") return rec.result;
  }
  throw new Error("boing_signature_missing");
}

async function requestNonce(chain: BrowserWalletChain, address: string) {
  const nonceRes = await fetch("/api/auth/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chain, address }),
  });
  const data = (await nonceRes.json()) as { message?: string; error?: string };
  if (!nonceRes.ok || !data.message) {
    throw new Error(data.error ?? "nonce_failed");
  }
  return data.message;
}

export async function signEvmWallet(): Promise<SignedWalletProof> {
  const eth = getEthereum();
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0];
  if (!address) throw new Error("no_account");
  const message = await requestNonce("evm", address);
  const signature = (await eth.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  return { chain: "evm", address, signature };
}

export async function signSolanaWallet(): Promise<SignedWalletProof> {
  const provider = (
    window as unknown as {
      solana?: {
        connect: () => Promise<{
          publicKey: { toBytes: () => Uint8Array; toString: () => string };
        }>;
        signMessage: (
          msg: Uint8Array,
          display?: string,
        ) => Promise<{ signature: Uint8Array }>;
      };
    }
  ).solana;
  if (!provider) throw new Error("No Phantom wallet found");
  const { publicKey } = await provider.connect();
  const address = publicKey.toString();
  const message = await requestNonce("solana", address);
  const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  return { chain: "solana", address, signature: bs58.encode(signed.signature) };
}

export async function signBoingWallet(): Promise<SignedWalletProof> {
  const provider = getBoing();
  const accounts = (await provider.request({
    method: "boing_requestAccounts",
  })) as string[];
  const address = Array.isArray(accounts) ? accounts[0] : undefined;
  if (!address) throw new Error("no_account");
  const message = await requestNonce("boing", address);
  let signed: unknown;
  try {
    signed = await provider.request({
      method: "boing_signMessage",
      params: [message],
    });
  } catch {
    signed = await provider.request({
      method: "personal_sign",
      params: [message, address],
    });
  }
  return { chain: "boing", address, signature: encodeBoingSignature(signed) };
}

export async function signWallet(
  chain: BrowserWalletChain,
): Promise<SignedWalletProof> {
  if (chain === "evm") return signEvmWallet();
  if (chain === "solana") return signSolanaWallet();
  return signBoingWallet();
}
