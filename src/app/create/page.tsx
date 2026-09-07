import { CreateWizard } from "@/components/CreateWizard";
import { HowItWorksNote } from "@/components/HowItWorksNote";

export default function CreatePage() {
  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Create
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "58ch", marginBottom: "0.85rem" }}>
        Walk through a short wizard to schedule a drop, mint a 1/1, or
        open an auction. Publish mints on-chain first; collectors pay crypto
        and receive the NFT at purchase.
      </p>
      <HowItWorksNote kind="create" />
      <CreateWizard />
    </div>
  );
}
