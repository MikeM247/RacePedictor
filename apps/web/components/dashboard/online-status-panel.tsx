"use client";

import { useState } from "react";
import type { OnlineStatus } from "../../../../packages/core/src/contracts/sync.ts";
import { onlineSignalStateLabel, toOnlineStatusSignals } from "../../lib/online-status-view.ts";

export function OnlineStatusPanel({ status }: { status: OnlineStatus }) {
  const signals = toOnlineStatusSignals(status);
  const attentionSignals = signals.filter((signal) => signal.state !== "current");
  const hasUrgentSignal = signals.some((signal) => signal.state === "action_required" || signal.state === "unavailable");
  const summary = attentionSignals.length === 0
    ? "All freshness signals current"
    : `${attentionSignals.length} ${attentionSignals.length === 1 ? "signal needs" : "signals need"} review`;
  const [open, setOpen] = useState(attentionSignals.length > 0);

  return (
    <details
      className={`online-status-panel${hasUrgentSignal ? " online-status-panel--urgent" : ""}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="online-status-heading">
        <div>
          <span className="eyebrow">System status</span>
          <span className="online-status-title" role="heading" aria-level={3}>Independent freshness signals</span>
        </div>
        <span className={`status-chip ${hasUrgentSignal ? "status-chip--danger" : attentionSignals.length > 0 ? "status-chip--warning" : "status-chip--healthy"}`}>{summary}</span>
      </summary>
      <div className="online-status-detail">
        <p>Local sync can be offline while cloud workouts remain current.</p>
        <ul className="online-status-grid">
          {signals.map((signal) => (
            <li key={signal.key} className={`online-signal online-signal--${signal.state}`}>
              <span>{signal.label}</span>
              <strong>{onlineSignalStateLabel[signal.state]}</strong>
              <small>
                {signal.suffix ? `${signal.suffix}. ` : ""}
                {signal.detail ? `Last update ${new Date(signal.detail).toLocaleString()}` : "No successful update yet"}
              </small>
            </li>
          ))}
        </ul>
        <p className="online-status-note">Workout ingestion does not imply an AI review or a training-plan change.</p>
      </div>
    </details>
  );
}
