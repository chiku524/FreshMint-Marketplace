"use client";

import { DISCOVERY_CONFIG } from "@/lib/discovery";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees/platform";
import Link from "next/link";
import { useEffect, useState } from "react";

export type HowItWorksKind = "home" | "create" | "buy" | "collect" | "funds";

const NOTES: Record<
  HowItWorksKind,
  { href: string; text: string }
> = {
  home: {
    href: "/docs#discovery",
    text: `Fair discovery: ${Math.round(DISCOVERY_CONFIG.feedMix.emerging_rising * 100)}% Emerging Rising on the homepage, quota enforced in code.`,
  },
  create: {
    href: "/docs#flow",
    text: "Create deploys your collection; publish mints into it. Collectors buy with crypto.",
  },
  buy: {
    href: "/docs#fees",
    text: `This buy pays native (or bridges via Relay) and transfers the NFT to your wallet. ${PLATFORM_FEE_PERCENT.total}% treasury.`,
  },
  collect: {
    href: "/docs#withdraw",
    text: "New buys already land in your wallet. Withdraw remains for legacy USD holds only.",
  },
  funds: {
    href: "/docs#settlement",
    text: "Primary buys settle on-chain. Bridges move natives; Boing stays same-chain.",
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
