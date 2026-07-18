import { ModerationPanel } from "@/components/ModerationPanel";

export default function ModeratePage() {
  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Moderation
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.5rem" }}>
        Rapid report handling and appeals. Upholding a report delists; approving an
        appeal restores the work to discovery.
      </p>
      <ModerationPanel />
    </div>
  );
}
