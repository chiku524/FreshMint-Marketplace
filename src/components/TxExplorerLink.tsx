"use client";

import type { Chain, NetworkId } from "@/lib/discovery/types";
import { shortTxHash, txExplorerUrl } from "@/lib/onchain/explorer";

export function TxExplorerLink({
  hash,
  network,
  chain,
  label,
  className,
}: {
  hash: string | null | undefined;
  network?: NetworkId | string | null;
  chain?: Chain | null;
  label?: string;
  className?: string;
}) {
  if (!hash) return null;
  const href = txExplorerUrl({ hash, network, chain });
  const text = label ?? shortTxHash(hash);
  if (!href) {
    return (
      <span className={className} title={hash}>
        {text}
      </span>
    );
  }
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={hash}
      style={{ color: "var(--accent-soft)" }}
    >
      {text}
    </a>
  );
}
