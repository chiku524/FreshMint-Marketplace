import Link from "next/link";

export const metadata = {
  title: "Not found — FreshMint Marketplace",
};

export default function NotFound() {
  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.2rem" }}>
        Page not found
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.5rem", maxWidth: "48ch" }}>
        This piece, creator or collection may have been delisted, or the link is
        mistyped.
      </p>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/">Back to discovery</Link>
        <Link href="/search">Search the marketplace</Link>
      </p>
    </div>
  );
}