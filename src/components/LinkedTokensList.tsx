import { getNetwork, resolveNetwork } from "@/lib/chains/registry";
import type { Chain } from "@/lib/discovery/types";
import {
  shortTokenAddress,
  type LinkedTokenRef,
} from "@/lib/marketplace/linked-tokens";

/**
 * Read-only chips for companion fungible tokens on a collection.
 */
export function LinkedTokensList({
  tokens,
  collectionChain,
  collectionNetwork,
  heading = "Linked tokens",
}: {
  tokens: LinkedTokenRef[];
  collectionChain: Chain;
  collectionNetwork?: string | null;
  heading?: string;
}) {
  if (!tokens.length) return null;

  return (
    <div className="linked-tokens-list">
      <h3 className="linked-tokens-list__heading">{heading}</h3>
      <ul className="linked-tokens-list__chips" aria-label={heading}>
        {tokens.map((token) => {
          const chain = token.chain ?? collectionChain;
          const network = resolveNetwork(collectionNetwork, chain);
          const href = getNetwork(network).explorerAddress(token.address);
          const label = token.label?.trim() || shortTokenAddress(token.address);
          return (
            <li key={`${chain}:${token.address}`}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="linked-tokens-list__chip"
                title={token.address}
              >
                <span className="linked-tokens-list__chip-label">{label}</span>
                <span className="linked-tokens-list__chip-addr">
                  {shortTokenAddress(token.address)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
