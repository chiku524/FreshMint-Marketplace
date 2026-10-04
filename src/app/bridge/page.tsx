import { BridgePanel } from "@/components/BridgePanel";
import { chainMode, listBridgeNetworks } from "@/lib/chains/registry";

export const metadata = {
  title: "Bridge — FreshMint Marketplace",
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
          Bridge native gas across {networks.map((n) => n.label).join(", ")}.{" "}
          Mode: <span className="badge">{chainMode()}</span>
        </p>
      </header>
      <BridgePanel />
    </div>
  );
}
