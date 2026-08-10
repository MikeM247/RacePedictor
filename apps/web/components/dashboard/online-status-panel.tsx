import type { OnlineStatus } from "../../../../packages/core/src/contracts/sync.ts";
import { onlineSignalStateLabel, toOnlineStatusSignals } from "../../lib/online-status-view.ts";

export function OnlineStatusPanel({ status }: { status: OnlineStatus }) {
  const signals = toOnlineStatusSignals(status);

  return (
    <section className="online-status-panel" aria-labelledby="online-status-heading">
      <div className="online-status-heading">
        <div>
          <p className="eyebrow">Online data status</p>
          <h3 id="online-status-heading">Independent freshness signals</h3>
        </div>
        <p>Local sync can be offline while cloud workouts remain current.</p>
      </div>
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
    </section>
  );
}
