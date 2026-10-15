import { CreateWizard } from "@/components/CreateWizard";
import { noIndexMetadata } from "@/lib/seo/site";
import { Suspense } from "react";

export const metadata = noIndexMetadata(
  "Create",
  "List a work or collection on FreshMint.",
);

export default function CreatePage() {
  return (
    <div className="create-fullscreen">
      <Suspense
        fallback={
          <p className="create-fullscreen__loading">Loading create wizard…</p>
        }
      >
        <CreateWizard />
      </Suspense>
    </div>
  );
}
