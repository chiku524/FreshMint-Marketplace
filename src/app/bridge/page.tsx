import { BridgePanel } from "@/components/BridgePanel";
import { HowItWorksNote } from "@/components/HowItWorksNote";
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
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Move funds
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "0.85rem" }}>
        Bridge native gas tokens across every network FreshMint mints on —{" "}
        {networks.map((n) => n.label).join(", ")}. Mode:{" "}
        <span className="badge">{chainMode()}</span>
      </p>
      <HowItWorksNote kind="funds" />
      <BridgePanel />
    </div>
  );
}
