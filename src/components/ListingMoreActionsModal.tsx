"use client";

import { FmDialog } from "@/components/FmDialog";
import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Secondary community actions (save / nominate / report) — kept out of the
 * listing first-viewport action cluster.
 */
export function ListingMoreActionsModal({
  listingId,
  stage,
}: {
  listingId: string;
  stage: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    undefined,
  );
  const [curatorScore, setCuratorScore] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (data.user && typeof data.user.id === "string") {
          setSessionUserId(data.user.id);
          setCuratorScore(
            typeof data.user.curatorScore === "number"
              ? data.user.curatorScore
              : 0,
          );
        } else {
          setSessionUserId(null);
          setCuratorScore(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionUserId(null);
          setCuratorScore(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || data.errors?.join(", ") || "failed");
      return { error: true as const };
    }
    return data as Record<string, unknown>;
  }

  const canNominate =
    Boolean(sessionUserId) &&
    stage !== "draft" &&
    (curatorScore ?? 0) >= DISCOVERY_CONFIG.nominationStakePoints;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="fm-btn fm-btn--ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMsg(null);
          setOpen(true);
        }}
      >
        More
      </button>

      <FmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="More actions"
        dialogClassName="listing-action-modal__dialog--narrow"
      >
        <div className="listing-more-actions">
          <button
            type="button"
            className="fm-btn fm-btn--ghost"
            onClick={() =>
              void post("/api/signals", { listingId, type: "save" }).then(
                (d) => {
                  if (!("error" in d)) {
                    setMsg("Saved");
                    router.refresh();
                  }
                },
              )
            }
          >
            Save
          </button>

          {sessionUserId && stage !== "draft" ? (
            canNominate ? (
              <button
                type="button"
                className="fm-btn fm-btn--ghost"
                title={`Costs ${DISCOVERY_CONFIG.nominationStakePoints} curator points`}
                onClick={() =>
                  void post("/api/nominate", { listingId }).then((d) => {
                    if (!("error" in d)) {
                      setMsg(
                        `Nominated (−${DISCOVERY_CONFIG.nominationStakePoints} curator pts)`,
                      );
                      setCuratorScore((s) =>
                        s == null
                          ? s
                          : Math.max(
                              0,
                              s - DISCOVERY_CONFIG.nominationStakePoints,
                            ),
                      );
                      router.refresh();
                    } else if (d && "error" in d) {
                      setMsg(
                        String((d as { error?: string }).error ?? "nominate_failed"),
                      );
                    }
                  })
                }
              >
                Nominate
              </button>
            ) : (
              <p className="fm-form-note" style={{ margin: 0 }}>
                Nominate needs {DISCOVERY_CONFIG.nominationStakePoints}+ curator
                points.
              </p>
            )
          ) : null}

          <button
            type="button"
            className="fm-btn fm-btn--ghost listing-more-actions__report"
            onClick={() =>
              void post("/api/report", {
                listingId,
                reason: "spam",
              }).then((d) => {
                if (!("error" in d)) setMsg("Reported");
              })
            }
          >
            Report
          </button>

          {msg ? <p className="fm-form-note">{msg}</p> : null}
        </div>
      </FmDialog>
    </>
  );
}
