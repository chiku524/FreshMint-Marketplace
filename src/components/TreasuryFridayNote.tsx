import Link from "next/link";
import { TREASURY_FRIDAY_COPY } from "@/lib/marketplace/friday-treasury-copy";

type Surface = keyof typeof TREASURY_FRIDAY_COPY;

export function TreasuryFridayNote({
  surface,
  className,
}: {
  surface: Exclude<Surface, "docs">;
  className?: string;
}) {
  const copy = TREASURY_FRIDAY_COPY[surface];
  const showLaneLink = surface === "listing" || surface === "collection";
  return (
    <p className={className}>
      {copy}
      {showLaneLink ? (
        <>
          {" "}
          <Link href="/open">Browse Open Lane</Link>
        </>
      ) : null}
    </p>
  );
}
