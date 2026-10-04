import { CreateWizard } from "@/components/CreateWizard";
import { Suspense } from "react";

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
