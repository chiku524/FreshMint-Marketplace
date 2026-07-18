import { CreateListingForm } from "@/components/CreateListingForm";

export default function CreatePage() {
  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Create & soft-launch
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.5rem" }}>
        Sign in with a wallet or demo persona, then soft-launch to Open Lane.
        Rising eligibility still requires quality gates, wallet cooldown, and weekly
        caps. Settlement is simulated on Sepolia / Solana Devnet references.
      </p>
      <CreateListingForm />
    </div>
  );
}
