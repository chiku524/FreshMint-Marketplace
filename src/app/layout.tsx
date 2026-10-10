import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import Script from "next/script";
import { BrandMark } from "@/components/MintLeaf";
import { LogoIntroSplash } from "@/components/LogoIntroSplashLoader";
import { PageEngraveBackground } from "@/components/PageEngraveBackground";
import { ReplayIntroButton } from "@/components/ReplayIntroButton";
import { DiscoverySidebar } from "@/components/DiscoverySidebar";
import { FridayRaffleBanner } from "@/components/FridayRaffleBanner";
import { SiteNav } from "@/components/SiteNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSessionUser, publicSession } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/auth/paths";
import { rootSiteMetadata, siteJsonLdGraph } from "@/lib/seo/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./listing-action-modals.css";
import "./collection-linked-tokens.css";

/** Apostrophic Labs Contra — freeware; “Contraa” maps to this face. */
const contra = localFont({
  src: [
    {
      path: "../fonts/contra/contra.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/contra/contra-italic.ttf",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-contra",
  display: "swap",
  fallback: ["Georgia", "ui-serif", "serif"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = rootSiteMetadata();

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSessionUser();
  const initialUser = session ? publicSession(session) : null;
  return (
    <html lang="en" className={`${contra.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(siteJsonLdGraph(appBaseUrl())),
          }}
        />
        <Script id="fm-theme-boot" strategy="beforeInteractive">
          {THEME_BOOT_SCRIPT}
        </Script>
        <Script id="fm-intro-boot" strategy="beforeInteractive">
          {`try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&(sessionStorage.getItem("fm-logo-intro-seen")!=="1"||/[?&]intro(?:[=&]|$)/.test(location.search))){document.documentElement.classList.add("fm-intro-pending");setTimeout(function(){document.documentElement.classList.remove("fm-intro-pending")},8000)}}catch(e){}`}
        </Script>
        <div className="site-shell">
          <div className="fm-intro-cover" aria-hidden="true" />
          <LogoIntroSplash />
          <PageEngraveBackground />
          <header className="site-header">
            <div className="site-header__start">
              <Link href="/" className="site-header__brand" aria-label="FreshMint home">
                <BrandMark size={32} />
              </Link>
              <SiteNav signedIn={Boolean(initialUser)} />
            </div>
            <div className="site-header__end">
              <ThemeToggle />
              <SiteNav signedIn={Boolean(initialUser)} area="account" />
            </div>
          </header>
          <div className="site-frame">
            <DiscoverySidebar />
            <div className="site-frame__main">
              <FridayRaffleBanner />
              <main className="site-main">{children}</main>
              <footer className="site-footer">
                <span className="site-footer__tagline">
                  Attention is scarce. Emerging artists get a coded quota.
                </span>
                <span className="site-footer__links">
                  <Link href="/docs#settlement">How it works</Link>
                  <Link href="/docs#discovery">Discovery</Link>
                  <ReplayIntroButton />
                </span>
              </footer>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
