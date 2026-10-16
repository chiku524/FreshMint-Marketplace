/** Shared route-level loading skeleton (used by loading.tsx files). */
export function RouteLoading({
  label = "Loading",
  variant = "grid",
}: {
  label?: string;
  variant?: "grid" | "detail" | "profile";
}) {
  return (
    <div className="page-wrap" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      <div className="fm-skeleton" style={{ height: "2.4rem", width: "min(22rem, 70%)", marginBottom: "0.75rem" }} />
      <div className="fm-skeleton" style={{ height: "1rem", width: "min(34rem, 90%)", marginBottom: "2rem" }} />
      {variant === "profile" ? (
        <div style={{ display: "grid", gap: "1rem" }} aria-hidden="true">
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div className="fm-skeleton" style={{ width: 72, height: 72, borderRadius: "50%" }} />
            <div style={{ display: "grid", gap: "0.5rem", flex: 1 }}>
              <div className="fm-skeleton" style={{ height: "1.8rem", width: "min(18rem, 70%)" }} />
              <div className="fm-skeleton" style={{ height: "1rem", width: "min(12rem, 50%)" }} />
            </div>
          </div>
          <div className="fm-skeleton-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="fm-skeleton" style={{ aspectRatio: "4 / 5" }} />
            ))}
          </div>
        </div>
      ) : variant === "detail" ? (
        <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="fm-skeleton" style={{ aspectRatio: "1 / 1" }} />
          <div style={{ display: "grid", gap: "0.75rem", alignContent: "start" }}>
            {/* Mirrors the listing page: badges, title, byline, price card, CTA, provenance. */}
            <div className="fm-skeleton" style={{ height: "1.2rem", width: "45%" }} />
            <div className="fm-skeleton" style={{ height: "2rem", width: "70%" }} />
            <div className="fm-skeleton" style={{ height: "1rem", width: "35%" }} />
            <div className="fm-skeleton" style={{ height: "7.5rem", borderRadius: "14px", marginTop: "0.5rem" }} />
            <div className="fm-skeleton" style={{ height: "2.8rem", width: "12rem" }} />
            <div className="fm-skeleton" style={{ height: "3rem", marginTop: "0.5rem" }} />
          </div>
        </div>
      ) : (
        <div className="fm-skeleton-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="fm-skeleton" style={{ aspectRatio: "4 / 5" }} />
          ))}
        </div>
      )}
    </div>
  );
}