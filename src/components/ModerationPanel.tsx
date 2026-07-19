"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ReportRow = {
  id: string;
  reason: string;
  listingId: string;
  listing: { title: string; delisted: boolean };
  reporter: { displayName: string };
};

type AppealRow = {
  id: string;
  message: string;
  listingId: string;
  listing: { title: string };
  creator: { displayName: string };
};

type NominationRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  nominatorName: string;
  stakePoints: number;
  createdAt: string;
};

export function ModerationPanel() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [nominations, setNominations] = useState<NominationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/moderation");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "forbidden");
      return;
    }
    setReports(data.reports ?? []);
    setAppeals(data.appeals ?? []);
    setNominations(data.nominations ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "failed");
      return;
    }
    await load();
    router.refresh();
  }

  if (error === "forbidden") {
    return (
      <p style={{ color: "var(--ink-muted)" }}>
        Sign in as a moderator or editor demo persona to access the queue.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      {error && error !== "forbidden" ? (
        <p style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}

      <section>
        <h2 className="display" style={{ fontSize: "1.4rem" }}>
          Pending nominations ({nominations.length})
        </h2>
        <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem", marginTop: 0 }}>
          Settle curator stakes: success rewards reputation; abuse penalizes it.
        </p>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          {nominations.length === 0 ? (
            <p style={{ color: "var(--ink-muted)" }}>No open nominations.</p>
          ) : (
            nominations.map((n) => (
              <div
                key={n.id}
                style={{
                  border: "1px solid var(--line)",
                  padding: "0.9rem 1rem",
                  background: "rgba(20,53,44,0.45)",
                }}
              >
                <strong>{n.listingTitle}</strong>
                <div style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
                  Nominated by {n.nominatorName} · stake {n.stakePoints} pts
                </div>
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.55rem" }}>
                  <button
                    type="button"
                    className="badge emerging"
                    style={{ cursor: "pointer", background: "transparent" }}
                    onClick={() =>
                      void act({
                        kind: "nomination",
                        nominationId: n.id,
                        outcome: "success",
                      })
                    }
                  >
                    Mark success
                  </button>
                  <button
                    type="button"
                    className="badge"
                    style={{
                      cursor: "pointer",
                      background: "transparent",
                      color: "var(--danger)",
                    }}
                    onClick={() =>
                      void act({
                        kind: "nomination",
                        nominationId: n.id,
                        outcome: "abuse",
                      })
                    }
                  >
                    Mark abuse
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="display" style={{ fontSize: "1.4rem" }}>
          Open reports ({reports.length})
        </h2>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          {reports.length === 0 ? (
            <p style={{ color: "var(--ink-muted)" }}>Queue clear.</p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid var(--line)",
                  padding: "0.9rem 1rem",
                  background: "rgba(20,53,44,0.45)",
                }}
              >
                <strong>{r.listing.title}</strong>
                <div style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
                  {r.reason} · by {r.reporter.displayName}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.55rem" }}>
                  <button
                    type="button"
                    className="badge"
                    style={{ cursor: "pointer", background: "transparent" }}
                    onClick={() =>
                      void act({
                        kind: "report",
                        reportId: r.id,
                        action: "dismiss",
                      })
                    }
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="badge"
                    style={{
                      cursor: "pointer",
                      background: "transparent",
                      color: "var(--danger)",
                    }}
                    onClick={() =>
                      void act({
                        kind: "report",
                        reportId: r.id,
                        action: "uphold",
                      })
                    }
                  >
                    Uphold & delist
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="display" style={{ fontSize: "1.4rem" }}>
          Pending appeals ({appeals.length})
        </h2>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          {appeals.length === 0 ? (
            <p style={{ color: "var(--ink-muted)" }}>No appeals.</p>
          ) : (
            appeals.map((a) => (
              <div
                key={a.id}
                style={{
                  border: "1px solid var(--line)",
                  padding: "0.9rem 1rem",
                  background: "rgba(20,53,44,0.45)",
                }}
              >
                <strong>{a.listing.title}</strong>
                <div style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
                  {a.creator.displayName}: {a.message}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.55rem" }}>
                  <button
                    type="button"
                    className="badge emerging"
                    style={{ cursor: "pointer", background: "transparent" }}
                    onClick={() =>
                      void act({
                        kind: "appeal",
                        appealId: a.id,
                        status: "approved",
                      })
                    }
                  >
                    Restore listing
                  </button>
                  <button
                    type="button"
                    className="badge"
                    style={{ cursor: "pointer", background: "transparent" }}
                    onClick={() =>
                      void act({
                        kind: "appeal",
                        appealId: a.id,
                        status: "rejected",
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
