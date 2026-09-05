import { CreateCollectionForm } from "@/components/CreateCollectionForm";
import { CreateListingForm } from "@/components/CreateListingForm";

export default function CreatePage() {
  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Create collection & drop
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "56ch", marginBottom: "1.5rem" }}>
        Collections, drops, and sales stay on FreshMint — no gas until someone
        withdraws an NFT or moves ETH / SOL / Boing. Pick a mint network for
        later withdrawal, then soft-launch to Open Lane. Need gas for a
        withdraw? <a href="/bridge">Bridge natives</a> (Boing is not on Relay).
      </p>
      <div
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "minmax(0, 0.85fr) minmax(0, 1.15fr)",
          alignItems: "start",
        }}
        className="create-split"
      >
        <section>
          <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
            New collection
          </h2>
          <CreateCollectionForm />
        </section>
        <section>
          <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
            Listing or scheduled drop
          </h2>
          <CreateListingForm />
        </section>
      </div>
    </div>
  );
}
