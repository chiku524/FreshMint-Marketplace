"use client";

import { BidPanel } from "@/components/BidPanel";
import { FmImage } from "@/components/FmImage";
import { FollowButton } from "@/components/FollowButton";
import { ListingActions } from "@/components/ListingActions";
import { SaveButton } from "@/components/SaveButton";
import type { Collection, Listing } from "@/lib/discovery/types";
import { dropWindowFor, primarySupplyCap } from "@/lib/marketplace/drops";
import { listingPagePath } from "@/lib/marketplace/listing-href";
import {
  dutchCurrentPriceUsd,
  minNextBidUsd,
  resolveSaleMode,
  saleModeBadge,
} from "@/lib/marketplace/sale-mode";
import { collectionHref } from "@/lib/marketplace/collection-slug";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function priceUsdForActions(listing: Listing): number | null {
  const saleMode = resolveSaleMode(listing);
  if (saleMode === "dutch") {
    return (
      dutchCurrentPriceUsd({
        startingBidUsd: listing.startingBidUsd,
        priceUsd: listing.priceUsd,
        reserveUsd: listing.reserveUsd,
        auctionStartsAt: listing.auctionStartsAt,
        auctionEndsAt: listing.auctionEndsAt,
      }) ?? listing.priceUsd
    );
  }
  return listing.priceUsd;
}

export function ListingPreviewModal({
  listing,
  onClose,
  creatorName,
  collection = null,
  sold = false,
  canStageRising = false,
  showActions = true,
}: {
  listing: Listing;
  onClose: () => void;
  creatorName?: string;
  collection?: Pick<Collection, "id" | "title" | "slug"> | null;
  sold?: boolean;
  canStageRising?: boolean;
  showActions?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      dialog
        ? [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
          )
        : [];

    const initial = focusables();
    (initial[0] ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [close, mounted]);

  const hue = hueFromId(listing.id);
  const media = listing.mediaUrl;
  const saleMode = resolveSaleMode(listing);
  const now = Date.now();
  const auctionLive =
    saleMode !== "fixed" &&
    listing.auctionStartsAt != null &&
    listing.auctionEndsAt != null &&
    now >= listing.auctionStartsAt &&
    now <= listing.auctionEndsAt;
  const auctionEnded =
    saleMode !== "fixed" &&
    listing.auctionEndsAt != null &&
    now > listing.auctionEndsAt;
  const minBid = minNextBidUsd({
    startingBidUsd: listing.startingBidUsd,
    priceUsd: listing.priceUsd,
    currentHighBidUsd: listing.currentHighBidUsd,
  });
  const cap = primarySupplyCap(listing);
  const dropState = dropWindowFor(listing).state;
  const minted = Boolean(
    listing.tokenId && listing.contractAddress && listing.mintTxHash,
  );
  const fullHref = listingPagePath(listing.id);

  const mediaStyle = media
    ? undefined
    : {
        background: `
          linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
          linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), var(--bg-deep))
        `,
      };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fm-form-dialog-scrim listing-preview-modal__scrim"
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fm-form-dialog listing-preview-modal__dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="listing-preview-modal__head">
          <button
            type="button"
            className="fm-btn fm-btn--ghost listing-preview-modal__close"
            aria-label="Close"
            onClick={close}
          >
            Close
          </button>
          <h2 id={titleId} className="display listing-preview-modal__title">
            <Link
              href={fullHref}
              className="listing-preview-modal__title-link"
              data-listing-preview-title=""
            >
              {listing.title}
            </Link>
          </h2>
        </div>

        <div
          className="work-media listing-preview-modal__media"
          style={mediaStyle}
        >
          {media ? (
            <FmImage
              src={media}
              alt=""
              fill
              sizes="(max-width: 640px) 92vw, 420px"
            />
          ) : null}
        </div>

        <p className="listing-preview-modal__byline">
          {creatorName ? (
            <Link href={`/creators/${listing.creatorId}`}>{creatorName}</Link>
          ) : (
            <Link href={`/creators/${listing.creatorId}`}>Creator</Link>
          )}
          {collection ? (
            <>
              {" · "}
              <Link href={collectionHref(collection)}>{collection.title}</Link>
            </>
          ) : null}
          {" · "}
          {saleModeBadge(listing)}
          {listing.priceUsd != null || saleMode === "dutch"
            ? ` · $${priceUsdForActions(listing) ?? "—"}`
            : null}
        </p>

        {listing.description ? (
          <p className="listing-preview-modal__desc">{listing.description}</p>
        ) : null}

        {listing.delisted ? (
          <p className="listing-detail__note listing-detail__note--unlisted">
            Not listed for sale.
          </p>
        ) : null}

        {showActions && !listing.delisted ? (
          <div className="listing-preview-modal__actions">
            <div className="listing-preview-modal__follow">
              <FollowButton artistId={listing.creatorId} compact />
              <SaveButton listingId={listing.id} compact />
            </div>
            {saleMode === "english" ? (
              <BidPanel
                listingId={listing.id}
                minBidUsd={minBid}
                live={auctionLive}
                ended={Boolean(auctionEnded)}
                winningBidUsd={listing.currentHighBidUsd}
                reserveMet={
                  !listing.reserveUsd ||
                  (listing.currentHighBidUsd != null &&
                    listing.currentHighBidUsd >= listing.reserveUsd)
                }
                isCreator={false}
              />
            ) : null}
            <ListingActions
              listingId={listing.id}
              creatorId={listing.creatorId}
              priceUsd={priceUsdForActions(listing)}
              stage={listing.stage}
              sold={sold}
              listingType={listing.type}
              chain={listing.chain}
              network={listing.network}
              isSecondary={Boolean(listing.isSecondary)}
              creatorRoyaltyBps={listing.creatorRoyaltyBps ?? null}
              dropState={dropState}
              repeatable={cap == null || cap > 1}
              minted={minted}
              canStageRising={canStageRising}
              suppressBuy={saleMode === "english" && auctionLive}
              layout="inline"
            />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ListingPreviewOpener({
  listing,
  children,
  className,
  style,
  ariaLabel,
  creatorName,
  collection = null,
  sold = false,
  canStageRising = false,
  showActions = true,
}: {
  listing: Listing;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  creatorName?: string;
  collection?: Pick<Collection, "id" | "title" | "slug"> | null;
  sold?: boolean;
  canStageRising?: boolean;
  showActions?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-listing-preview-open=""
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open ? (
        <ListingPreviewModal
          listing={listing}
          onClose={() => setOpen(false)}
          creatorName={creatorName}
          collection={collection}
          sold={sold}
          canStageRising={canStageRising}
          showActions={showActions}
        />
      ) : null}
    </>
  );
}
