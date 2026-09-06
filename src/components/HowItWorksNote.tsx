"use client";

import { PLATFORM_FEE_PERCENT } from "@/lib/fees/platform";
import Link from "next/link";
import { useEffect, useState } from "react";

export type HowItWorksKind = "home" | "create" | "buy" | "collect" | "funds";

const NOTES: Record<
  HowItWorksKind,
  { href: string; text: string }
> = {
  home: {
    href: "/docs#flow",
    text: `Collect on FreshMint — no gas on buys. ${PLATFORM_FEE_PERCENT.total}% treasury.`,
  },
  create: {
    href: "/docs#flow",
    text: "Create deploys your collection; publish mints into it. Collectors buy in USD.",
  },
  buy: {
    href: "/docs#fees",
    text: `This buy settles here. ${PLATFORM_FEE_PERCENT.total}% to the treasury. Withdraw anytime.`,
  },
  collect: {
    href: "/docs#withdraw",
    text: "Withdraw transfers an already-minted token to your wallet — it does not mint again.",
  },
  funds: {
    href: "/docs#settlement",
    text: "Bridges and cash-out are on-chain. Art sales and listings are not.",
  },
};

export function HowItWorksNote({
  kind,
  className,
}: {
  kind: HowItWorksKind;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const storageKey = `fm-how-it-works:${kind}`;
  const note = NOTES[kind];

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) !== "1") {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, [storageKey]);

  if (!visible) return null;

  return (
    <p className={`how-it-works-note${className ? ` ${className}` : ""}`}>
      <span>{note.text}</span>
      <span className="how-it-works-note__actions">
        <Link href={note.href}>How it works</Link>
        <button
          type="button"
          className="how-it-works-note__dismiss"
          aria-label="Dismiss this note"
          onClick={() => {
            try {
              window.localStorage.setItem(storageKey, "1");
            } catch {
              // keep the note gone for this visit
            }
            setVisible(false);
          }}
        >
          Dismiss
        </button>
      </span>
    </p>
  );
}
