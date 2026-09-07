"use client";

import type { RankedListing, Listing } from "@/lib/discovery/types";
import { dropWindowFor, primarySupplyCap } from "@/lib/marketplace/drops";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ImpressionTracker } from "./ImpressionTracker";
import { ListingActions } from "./ListingActions";

const MENU_HOVER_MS = 1000;
const MENU_LEAVE_MS = 180;
const MENU_FADE_MS = 280;

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function priceLabel(listing: Listing, bucket?: string) {
  if (bucket === "sold" && listing.priceUsd != null) {
    return `sold $${listing.priceUsd}`;
  }
  if (listing.priceUsd != null) return `$${listing.priceUsd}`;
  return "auction";
}

function useDelayedMenu() {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [hovering, setHovering] = useState(false);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const openFrame = useRef<number | null>(null);
  const openRef = useRef(false);

  const clearTimers = () => {
    if (enterTimer.current != null) window.clearTimeout(enterTimer.current);
    if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    if (openFrame.current != null) window.cancelAnimationFrame(openFrame.current);
    enterTimer.current = null;
    leaveTimer.current = null;
    openFrame.current = null;
  };

  useEffect(() => {
    if (open || !rendered) return;
    const hide = window.setTimeout(() => setRendered(false), MENU_FADE_MS);
    return () => window.clearTimeout(hide);
  }, [open, rendered]);

  useEffect(() => () => clearTimers(), []);

  const show = () => {
    openRef.current = true;
    setRendered(true);
    openFrame.current = window.requestAnimationFrame(() => {
      openFrame.current = window.requestAnimationFrame(() => {
        openFrame.current = null;
        setOpen(true);
      });
    });
  };

  const hide = () => {
    openRef.current = false;
    if (openFrame.current != null) {
      window.cancelAnimationFrame(openFrame.current);
      openFrame.current = null;
    }
    setOpen(false);
  };

  const onPointerEnter = () => {
    setHovering(true);
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (openRef.current || enterTimer.current != null) return;
    enterTimer.current = window.setTimeout(() => {
      enterTimer.current = null;
      show();
    }, MENU_HOVER_MS);
  };

  const onPointerLeave = () => {
    setHovering(false);
    if (enterTimer.current != null) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    leaveTimer.current = window.setTimeout(hide, MENU_LEAVE_MS);
  };

  const toggle = () => {
    clearTimers();
    if (openRef.current) hide();
    else show();
  };

  const close = () => {
    clearTimers();
    hide();
  };

  return {
    open,
    rendered,
    hovering,
    onPointerEnter,
    onPointerLeave,
    toggle,
    close,
  };
}

export function WorkCard({
  listing,
  emerging,
  bucket,
  score,
  showActions = false,
  creatorName,
  trackImpression = true,
  footer,
  sold = false,
  canStageRising = false,
}: {
  listing: Listing;
  emerging?: boolean;
  bucket?: string;
  score?: number;
  showActions?: boolean;
  creatorName?: string;
  trackImpression?: boolean;
  footer?: ReactNode;
  sold?: boolean;
  canStageRising?: boolean;
}) {
  const hue = hueFromId(listing.id);
  const media = listing.mediaUrl;
  const featured =
    listing.stage === "featured" || bucket === "featured";
  const menu = useDelayedMenu();
  const menuId = useId();
  const [spinning, setSpinning] = useState(false);
  const supplyCap = primarySupplyCap(listing);
  const dropState = dropWindowFor(listing).state;

  const actions = showActions ? (
    <ListingActions
      listingId={listing.id}
      creatorId={listing.creatorId}
      priceUsd={listing.priceUsd}
      stage={listing.stage}
      sold={sold || bucket === "sold"}
      listingType={listing.type}
      chain={listing.chain}
      network={listing.network}
      dropState={dropState}
      repeatable={supplyCap == null || supplyCap > 1}
      minted={Boolean(
        listing.tokenId && listing.contractAddress && listing.mintTxHash,
      )}
      canStageRising={canStageRising}
      layout="menu"
    />
  ) : null;

  const menuBody = (
    <>
      {creatorName ? (
        <p className="work-tile__menu-meta">
          <Link href={`/creators/${listing.creatorId}`}>{creatorName}</Link>
          {emerging ? " · Emerging" : featured ? " · Featured" : ""}
          {score != null ? ` · ${score.toFixed(1)}` : ""}
        </p>
      ) : null}
      {actions}
      {footer ? <div className="work-tile__footer">{footer}</div> : null}
    </>
  );

  const tileClass = [
    "work-tile",
    featured ? "work-tile--featured" : "work-tile--compact",
    menu.open ? "is-menu-open" : "",
    menu.hovering ? "is-hovering" : "",
    !featured && spinning ? "is-spinning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={tileClass}
      data-tile={featured ? "featured" : "compact"}
      onPointerEnter={() => {
        menu.onPointerEnter();
        if (!featured && !spinning) setSpinning(true);
      }}
      onPointerLeave={menu.onPointerLeave}
      onAnimationEnd={(event) => {
        if (
          !featured &&
          event.animationName === "work-card-spin" &&
          event.target === event.currentTarget
        ) {
          setSpinning(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.open) {
          event.stopPropagation();
          menu.close();
        }
      }}
    >
      {trackImpression ? (
        <ImpressionTracker listingId={listing.id} bucket={bucket} />
      ) : null}
      <Link
        href={`/listings/${listing.id}`}
        className="work-tile__media-link"
        tabIndex={-1}
        aria-hidden
      >
        <div
          className="work-media"
          style={
            media
              ? {
                  backgroundImage: `url(${media})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {
                  background: `
            linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
            linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), var(--bg-deep))
          `,
                }
          }
        />
      </Link>
      <div className="work-tile__caption">
        <h3 className="display work-tile__title">
          <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
        </h3>
        <p className="work-tile__meta">{priceLabel(listing, bucket)}</p>
      </div>
      <button
        type="button"
        className="work-tile__more"
        aria-expanded={menu.open}
        aria-controls={menuId}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          menu.toggle();
        }}
      >
        More
      </button>
      {menu.rendered ? (
        <div
          id={menuId}
          className="work-tile__menu"
          role="dialog"
          aria-label={`${listing.title} actions`}
          aria-hidden={!menu.open}
        >
          {menuBody}
        </div>
      ) : null}
    </article>
  );
}

export function RankedWorkCard({
  item,
  showActions = true,
  creatorName,
}: {
  item: RankedListing;
  showActions?: boolean;
  creatorName?: string;
}) {
  return (
    <WorkCard
      listing={item.listing}
      emerging={item.emerging}
      bucket={String(item.bucket)}
      score={item.score}
      showActions={showActions}
      creatorName={creatorName}
    />
  );
}
