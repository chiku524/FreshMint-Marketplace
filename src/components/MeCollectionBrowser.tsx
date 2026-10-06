"use client";

import { ProfileArtworkSection } from "@/components/ProfileWorksExplorer";
import { ProfileViewToggle } from "@/components/ProfileViewToggle";
import { ResaleListButton } from "@/components/ResaleListButton";
import { ResumeCryptoPurchaseButton } from "@/components/ResumeCryptoPurchaseButton";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { WalletNftCard } from "@/components/WalletNftCard";
import { WithdrawCollectedButton } from "@/components/WithdrawCollectedButton";
import { useProfileViewMode } from "@/components/useProfileViewMode";
import type { Listing } from "@/lib/discovery/types";
import type { ProfileViewId } from "@/lib/profile-view";
import type { WalletNft } from "@/lib/wallet/inventory";
import Link from "next/link";
import type { ReactNode } from "react";

export type MeCreatedWork = {
  listing: Listing;
  sold: boolean;
  footer: string | null;
};

export type MeCollectedWork = {
  purchaseId: string;
  listing: Listing;
  purchasedAt: number;
  amountUsd: number;
  txHash: string | null;
  fromWallet?: boolean;
  status?: string;
  withdrawnAt?: number | null;
  withdrawTxHash?: string | null;
  payNetwork?: string | null;
};

function collectedFooter(item: MeCollectedWork): ReactNode {
  if (item.fromWallet) return <>Held in a linked wallet</>;
  return (
    <>
      Collected {new Date(item.purchasedAt).toLocaleDateString()} · $
      {item.amountUsd}
      {item.txHash ? (
        <>
          {" · "}
          <TxExplorerLink
            hash={item.txHash}
            chain={item.listing.chain}
            network={item.listing.network}
          />
        </>
      ) : null}
      <span style={{ display: "block", marginTop: "0.35rem" }}>
        {item.status === "pending_payment" ||
        item.status === "pending_transfer" ? (
          <ResumeCryptoPurchaseButton
            purchaseId={item.purchaseId}
            chain={item.listing.chain}
            network={item.listing.network}
            status={String(item.status)}
          />
        ) : (
          <WithdrawCollectedButton
            purchaseId={item.purchaseId}
            chain={item.listing.chain}
            network={item.listing.network}
            withdrawn={Boolean(item.withdrawnAt)}
            withdrawTxHash={item.withdrawTxHash ?? null}
            cryptoOwned={Boolean(
              item.payNetwork &&
                (!item.status || item.status === "completed"),
            )}
          />
        )}
        {item.status === "completed" && !item.fromWallet ? (
          <span style={{ display: "block", marginTop: "0.35rem" }}>
            <ResaleListButton
              purchaseId={item.purchaseId}
              defaultPriceUsd={Number(item.amountUsd)}
            />
          </span>
        ) : null}
      </span>
    </>
  );
}

function WalletList({ nfts }: { nfts: WalletNft[] }) {
  return (
    <div className="collections-list profile-works-list">
      {nfts.map((nft) => {
        const href = nft.listingId
          ? `/listings/${nft.listingId}`
          : nft.explorerUrl;
        const external = !nft.listingId;
        const style = nft.mediaUrl
          ? {
              backgroundImage: `url(${nft.mediaUrl})`,
              backgroundSize: "cover" as const,
              backgroundPosition: "center" as const,
            }
          : undefined;
        const body = (
          <>
            <div className="collections-row__thumb" style={style} />
            <span>
              <strong className="display">{nft.title || "Wallet NFT"}</strong>
              <em>
                {nft.networkLabel}
                {nft.tokenId ? ` · #${nft.tokenId}` : ""}
              </em>
            </span>
            <span className="collections-row__count">
              {nft.listingId ? "On FreshMint" : "External"}
            </span>
          </>
        );
        return external ? (
          <a
            key={`${nft.networkLabel}:${nft.id}`}
            href={href}
            className="collections-row"
            target="_blank"
            rel="noreferrer"
          >
            {body}
          </a>
        ) : (
          <Link
            key={`${nft.networkLabel}:${nft.id}`}
            href={href}
            className="collections-row"
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}

function CreatedSection({
  view,
  created,
}: {
  view: ProfileViewId;
  created: MeCreatedWork[];
}) {
  if (created.length === 0) {
    return (
      <section className="me-section">
        <h2 className="display me-section__title">Created (0)</h2>
        <p className="fm-empty-copy">
          Nothing created yet. <Link href="/create">Soft-launch a work</Link>.
        </p>
      </section>
    );
  }

  return (
    <ProfileArtworkSection
      title="Created"
      count={created.length}
      view={view}
      items={created.map((item) => ({
        listing: item.listing,
        sold: item.sold,
        showActions: true,
        trackImpression: false,
        canStageRising: true,
        footer: item.footer,
      }))}
      empty={null}
    />
  );
}

function CollectedSection({
  view,
  collected,
}: {
  view: ProfileViewId;
  collected: MeCollectedWork[];
}) {
  if (collected.length === 0) {
    return (
      <section className="me-section">
        <h2 className="display me-section__title">Collected (0)</h2>
        <p className="fm-empty-copy">
          No purchases yet. Browse the <Link href="/open">Open Lane</Link>.
        </p>
      </section>
    );
  }

  return (
    <ProfileArtworkSection
      title="Collected"
      count={collected.length}
      view={view}
      items={collected.map((item) => ({
        key: item.purchaseId,
        listing: item.listing,
        bucket: "sold",
        showActions: false,
        trackImpression: false,
        footer: collectedFooter(item),
      }))}
      empty={null}
    />
  );
}

function WalletSection({
  view,
  inWallet,
  hasWallets,
  hasBoingWallet,
}: {
  view: ProfileViewId;
  inWallet: WalletNft[];
  hasWallets: boolean;
  hasBoingWallet: boolean;
}) {
  if (!hasWallets) {
    return (
      <section className="me-section">
        <h2 className="display me-section__title">In wallet (0)</h2>
        <p className="fm-empty-copy">
          Link a wallet in <Link href="/me/settings">Settings</Link> to pull
          on-chain NFTs into this collection.
        </p>
      </section>
    );
  }

  if (inWallet.length === 0) {
    return (
      <section className="me-section">
        <h2 className="display me-section__title">In wallet (0)</h2>
        <p className="fm-empty-copy">
          {hasBoingWallet
            ? "No other FreshMint-known Boing NFTs found in linked wallets yet (or RPC was unreachable)."
            : "No other NFTs found in linked wallets yet."}
        </p>
      </section>
    );
  }

  if (view === "list") {
    return (
      <section className="me-section">
        <h2 className="display me-section__title">
          In wallet ({inWallet.length})
        </h2>
        <WalletList nfts={inWallet} />
      </section>
    );
  }

  return (
    <ProfileArtworkSection
      title="In wallet"
      count={inWallet.length}
      view={view}
      empty={null}
      walletCards={inWallet.map((nft) => (
        <WalletNftCard key={`${nft.networkLabel}:${nft.id}`} nft={nft} />
      ))}
    />
  );
}

/**
 * Private /me Collection tab browser. Keeps Created / Collected / In wallet
 * as separate filters; Sales / shelves / bridges slot in as opaque nodes.
 */
export function MeCollectionBrowser({
  created,
  collected,
  inWallet,
  hasWallets,
  hasBoingWallet,
  initialView = "grid",
  sales,
  shelves,
  bridges,
}: {
  created: MeCreatedWork[];
  collected: MeCollectedWork[];
  inWallet: WalletNft[];
  hasWallets: boolean;
  hasBoingWallet: boolean;
  initialView?: ProfileViewId;
  sales: ReactNode;
  shelves: ReactNode;
  bridges: ReactNode;
}) {
  const { view, select } = useProfileViewMode(initialView);

  return (
    <>
      <div className="profile-catalog__toolbar me-collection-toolbar">
        <p className="profile-catalog__hint">
          Gallery, grid, or list for works you created, collected, or hold.
        </p>
        <ProfileViewToggle
          view={view}
          onChange={select}
          label="Collection view"
        />
      </div>
      <CreatedSection view={view} created={created} />
      {sales}
      <CollectedSection view={view} collected={collected} />
      <WalletSection
        view={view}
        inWallet={inWallet}
        hasWallets={hasWallets}
        hasBoingWallet={hasBoingWallet}
      />
      {shelves}
      {bridges}
    </>
  );
}
