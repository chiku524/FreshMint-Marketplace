import { BridgePanel } from "@/components/BridgePanel";
import { chainMode, listBridgeNetworks } from "@/lib/chains/registry";

export const metadata = {
  title: "Bridge",
  description:
    "Move native ETH and SOL across FreshMint mint networks via Relay.",
};

export default function BridgePage() {
  const networks = listBridgeNetworks();
  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Move funds</h1>
        <p className="page-lead__copy">
          Move ETH or SOL between {networks.map((n) => n.label).join(", ")} so
          you have funds on the network a work is sold on. Get a quote, then
          confirm in your wallet.
          {chainMode() !== "mainnet" ? (
            <>
              {" "}
              <span className="badge">Test networks</span>
            </>
          ) : null}
        </p>
      </header>
      <BridgePanel />
    </div>
  );
}
