import { CreateWizard } from "@/components/CreateWizard";
import { HowItWorksNote } from "@/components/HowItWorksNote";
import { Suspense } from "react";

export default function CreatePage() {
  return (
    <div className="page-wrap create-page">
      <header className="create-page__intro">
        <p className="create-page__eyebrow">Studio</p>
        <h1 className="display create-page__title">Create</h1>
        <p className="create-page__lede">
          Schedule a drop, mint a 1/1, or open a timed sale. The left stage shows
          how collectors will meet the set as you fill each field.
        </p>
      </header>
      <HowItWorksNote kind="create" />
      <Suspense
        fallback={
          <p style={{ color: "var(--ink-muted)" }}>Loading create wizard…</p>
        }
      >
        <CreateWizard />
      </Suspense>
    </div>
  );
}
