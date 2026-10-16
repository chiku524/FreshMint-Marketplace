import { FridayRafflePanel } from "@/components/FridayRafflePanel";
import { TreasuryActivityList } from "@/components/TreasuryActivityList";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees/platform";
import {
  formatTreasuryAddress,
  getTreasuryPublicOverview,
} from "@/lib/marketplace/treasury-public";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Treasury",
  description:
    "FreshMint marketplace treasury addresses, native balances, Friday buys, and raffle activity.",
};

export default async function TreasuryPage() {
  const overview = await getTreasuryPublicOverview({ activityLimit: 28 });
  const configured = overview.balances.filter((b) => b.address);

  return (
    <div className="page-wrap treasury-page">
      <header className="page-lead treasury-page__lead">
        <p className="treasury-page__brand">FreshMint</p>
        <h1 className="display page-lead__title">Treasury</h1>
        <p className="page-lead__copy">
          {PLATFORM_FEE_PERCENT.total}% of each sale goes to the FreshMint
          treasury, which buys work from artists and funds the Friday raffle.
          Fees collected this week:{" "}
          <strong>${overview.weekProfitUsd.toFixed(2)}</strong>.
        </p>
      </header>

      <section className="treasury-balances" aria-label="Balances">
        <h2 className="display treasury-balances__title">Balances</h2>
        {configured.length === 0 ? (
          <p className="page-lead__copy">
            Treasury wallets will be listed here once they are published.
          </p>
        ) : (
          <ul className="treasury-balances__list">
            {configured.map((row) => (
              <li key={row.id} className="treasury-balances__row">
                <div className="treasury-balances__net">
                  <span className="treasury-balances__label">{row.label}</span>
                  {row.explorerUrl && row.address ? (
                    <a
                      href={row.explorerUrl}
                      className="treasury-balances__addr"
                      target="_blank"
                      rel="noreferrer"
                      title={row.address}
                    >
                      {formatTreasuryAddress(row.address)}
                    </a>
                  ) : (
                    <span className="treasury-balances__addr">
                      {formatTreasuryAddress(row.address)}
                    </span>
                  )}
                </div>
                <div className="treasury-balances__amt">
                  {row.balance ?? "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="treasury-balances__note">
          Balances are read live from each network.{" "}
          <Link href="/docs#fees">How fees work</Link>
          {" · "}
          <Link href="/open">Browse works</Link>
        </p>
      </section>

      <TreasuryActivityList items={overview.activity} />

      <section className="treasury-raffle-block">
        <FridayRafflePanel surface="public" />
      </section>
    </div>
  );
}
