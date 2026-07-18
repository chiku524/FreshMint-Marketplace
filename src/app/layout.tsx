import type { Metadata } from "next";
import { Literata, Syne } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FreshMint Marketplace — Fair Discovery for Digital Art",
  description:
    "NFT marketplace for EVM and Solana with Emerging quotas, composed feeds, and anti-congestion discovery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${literata.variable} h-full`}>
      <body className="site-shell min-h-full">
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem clamp(1rem, 4vw, 3rem)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Link href="/" className="display" style={{ fontSize: "1.35rem", fontWeight: 700 }}>
            FreshMint
          </Link>
          <nav
            style={{
              display: "flex",
              gap: "1.25rem",
              fontSize: "0.95rem",
              color: "var(--ink-muted)",
            }}
          >
            <Link href="/rising">Rising</Link>
            <Link href="/open">Open Lane</Link>
            <Link href="/featured">Featured</Link>
            <Link href="/shelves">Shelves</Link>
            <Link href="/metrics">Metrics</Link>
          </nav>
        </header>
        <main style={{ flex: 1 }}>{children}</main>
        <footer
          style={{
            padding: "2rem clamp(1rem, 4vw, 3rem)",
            borderTop: "1px solid var(--line)",
            color: "var(--ink-muted)",
            fontSize: "0.9rem",
          }}
        >
          Attention is scarce. Emerging artists get a coded quota — not a slogan.
        </footer>
      </body>
    </html>
  );
}
