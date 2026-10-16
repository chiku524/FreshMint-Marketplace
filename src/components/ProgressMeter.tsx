/**
 * Accessible progress bar for long-running wizard work (uploads, listing
 * creation, minting). Big batches get an explicit "keep this tab open" hint.
 */
export function ProgressMeter({
  label,
  current,
  total,
  note,
}: {
  label: string;
  current: number;
  total: number;
  note?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="fm-progress" aria-live="polite">
      <div className="fm-progress__row">
        <span className="fm-progress__label">{label}</span>
        <span className="fm-progress__count">
          {current.toLocaleString()} / {total.toLocaleString()} · {pct}%
        </span>
      </div>
      <div
        className="fm-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
      >
        <div className="fm-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {note || total >= 50 ? (
        <p className="fm-progress__note">
          {note ?? "Keep this tab open. If it closes, come back and retry \u2014 finished items are kept and won\u2019t be redone."}
        </p>
      ) : null}
    </div>
  );
}