import { StudioPanel } from "@/components/StudioPanel";

export default function StudioPage() {
  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Studio
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.5rem" }}>
        Editorial Featured controls and collector shelf publishing. Sign in as Guest
        Atelier (editor) or Mira to curate.
      </p>
      <StudioPanel />
    </div>
  );
}
