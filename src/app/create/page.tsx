import { CreateCollectionForm } from "@/components/CreateCollectionForm";
import { CreateDropForm } from "@/components/CreateDropForm";
import { CreateListingForm } from "@/components/CreateListingForm";
import { HowItWorksNote } from "@/components/HowItWorksNote";

export default function CreatePage() {
  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Create collection & drop
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "58ch", marginBottom: "0.85rem" }}>
        Schedule a limited or open-edition drop so collectors buy from you.
        Upload up to 10 GB of art per collection, add traits, then pick a mint
        network for later withdrawal.
      </p>
      <HowItWorksNote kind="create" />
      <section style={{ marginBottom: "2.25rem" }}>
        <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
          Schedule a drop
        </h2>
        <CreateDropForm />
      </section>
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
            Single listing or auction
          </h2>
          <CreateListingForm />
        </section>
      </div>
    </div>
  );
}
