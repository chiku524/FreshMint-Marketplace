import bs58 from "bs58";

export type BrowserWalletChain = "evm" | "solana" | "boing";

export type SignedWalletProof = {
  chain: BrowserWalletChain;
  address: string;
  signature: string;
};

export type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isCoinbaseWallet?: boolean;
  isCoinbaseBrowser?: boolean;
  isBraveWallet?: boolean;
  isRabby?: boolean;
  providers?: EthProvider[];
};

export type DiscoveredEvmWallet = {
  id: string;
  name: string;
  rdns?: string;
  icon?: string;
  provider: EthProvider;
};

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBytes: () => Uint8Array; toString: () => string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toBytes: () => Uint8Array; toString: () => string };
  }>;
  signMessage: (
    msg: Uint8Array,
    display?: string,
  ) => Promise<{ signature: Uint8Array }>;
};

function guessLegacyName(eth: EthProvider): string {
  if (eth.isPhantom) return "Phantom";
  if (eth.isCoinbaseWallet || eth.isCoinbaseBrowser) return "Coinbase Wallet";
  if (eth.isRabby) return "Rabby";
  if (eth.isBraveWallet) return "Brave";
  if (eth.isMetaMask) return "MetaMask";
  return "EVM wallet";
}

function addDiscovered(
  into: Map<string, DiscoveredEvmWallet>,
  wallet: DiscoveredEvmWallet,
) {
  const seen = [...into.values()].some((w) => w.provider === wallet.provider);
  if (seen) return;
  into.set(wallet.id, wallet);
}

export function discoverEvmWallets(): Promise<DiscoveredEvmWallet[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredEvmWallet>();

    function onAnnounce(event: Event) {
      const detail = (event as CustomEvent).detail as
        | {
            info?: { uuid?: string; name?: string; icon?: string; rdns?: string };
            provider?: EthProvider;
          }
        | undefined;
      if (!detail?.info?.uuid || !detail.provider) return;
      addDiscovered(found, {
        id: detail.info.uuid,
        name: detail.info.name ?? "EVM wallet",
        rdns: detail.info.rdns,
        icon: detail.info.icon,
        provider: detail.provider,
      });
    }

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      const w = window as unknown as {
        ethereum?: EthProvider;
        phantom?: { ethereum?: EthProvider };
        coinbaseWalletExtension?: EthProvider;
      };
      const injected = [
        ...(w.ethereum?.providers ?? []),
        w.phantom?.ethereum,
        w.coinbaseWalletExtension,
        found.size === 0 ? w.ethereum : undefined,
      ].filter((p): p is EthProvider => Boolean(p?.request));

      for (const provider of injected) {
        const name = guessLegacyName(provider);
        addDiscovered(found, {
          id: `legacy:${name}:${injected.indexOf(provider)}`,
          name,
          provider,
        });
      }
      resolve([...found.values()]);
    }, 80);
  });
}

function getBoing(): EthProvider {
  const w = window as unknown as {
    boing?: EthProvider;
    boingExpress?: EthProvider;
  };
  const provider = w.boing ?? w.boingExpress;
  if (!provider?.request) {
    throw new Error("No Boing Express wallet found — install Boing Express");
  }
  return provider;
}

function getSolana(): SolanaProvider {
  const w = window as unknown as {
    phantom?: { solana?: SolanaProvider };
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
  };
  const provider = w.phantom?.solana ?? w.solana ?? w.solflare;
  if (!provider?.connect || !provider.signMessage) {
    throw new Error("No Solana wallet found — install Phantom or Solflare");
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

export async function signEvmWallet(
  provider: EthProvider,
): Promise<SignedWalletProof> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts[0];
  if (!address) throw new Error("no_account");
  const message = await requestNonce("evm", address);
  const signature = (await provider.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  return { chain: "evm", address, signature };
}

async function connectSolana(provider: SolanaProvider) {
  if (provider.publicKey) {
    return { publicKey: provider.publicKey };
  }
  try {
    return await provider.connect();
  } catch (error) {
    if (provider.publicKey) return { publicKey: provider.publicKey };
    throw error;
  }
}

export async function signSolanaWallet(): Promise<SignedWalletProof> {
  const provider = getSolana();
  const { publicKey } = await connectSolana(provider);
  const address = publicKey.toString();
  const message = await requestNonce("solana", address);
  const signed = await provider.signMessage(
    new TextEncoder().encode(message),
    "utf8",
  );
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
  evmProvider?: EthProvider,
): Promise<SignedWalletProof> {
  if (chain === "evm") {
    if (!evmProvider) throw new Error("evm_wallet_required");
    return signEvmWallet(evmProvider);
  }
  if (chain === "solana") return signSolanaWallet();
  return signBoingWallet();
}

export const WALLET_AUTH_ERRORS: Record<string, string> = {
  wallet_already_linked: "That wallet is already on another profile.",
  evm_wallet_required: "Choose an EVM wallet to continue.",
  nonce_expired: "Sign-in expired. Try again.",
  invalid_signature: "Signature did not match. Try another wallet.",
};
