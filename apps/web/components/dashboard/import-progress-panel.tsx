import type { ImportProgressView } from "../../lib/dashboard-view-model";
import { PanelCard } from "./panel-card";

type ImportProgressPanelProps = {
  progress: ImportProgressView;
};

export function ImportProgressPanel({ progress }: ImportProgressPanelProps) {
  return (
    <PanelCard title="Import progress">
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{progress.status}</dd>
        </div>
        <div>
          <dt>Staged</dt>
          <dd>{progress.stagedCount}</dd>
        </div>
        <div>
          <dt>Normalized</dt>
          <dd>{progress.normalizedCount}</dd>
        </div>
        <div>
          <dt>Duplicates</dt>
          <dd>{progress.duplicateCount}</dd>
        </div>
        <div>
          <dt>Rejected</dt>
          <dd>{progress.rejectedCount}</dd>
        </div>
      </dl>
    </PanelCard>
  );
}
