/** Shared route-level loading skeleton (used by loading.tsx files). */
export function RouteLoading({
  label = "Loading",
  variant = "grid",
}: {
  label?: string;
  variant?: "grid" | "detail";
}) {
  return (
    <div className="page-wrap" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      <div className="fm-skeleton" style={{ height: "2.4rem", width: "min(22rem, 70%)", marginBottom: "0.75rem" }} />
      <div className="fm-skeleton" style={{ height: "1rem", width: "min(34rem, 90%)", marginBottom: "2rem" }} />
      {variant === "detail" ? (
        <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="fm-skeleton" style={{ aspectRatio: "1 / 1" }} />
          <div style={{ display: "grid", gap: "0.75rem", alignContent: "start" }}>
            <div className="fm-skeleton" style={{ height: "1.6rem", width: "60%" }} />
            <div className="fm-skeleton" style={{ height: "1rem" }} />
            <div className="fm-skeleton" style={{ height: "1rem", width: "80%" }} />
            <div className="fm-skeleton" style={{ height: "2.8rem", width: "12rem", marginTop: "1rem" }} />
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