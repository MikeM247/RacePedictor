import type { DriverContributionView, FeatureTrendPointView } from "./dashboard-view-model.ts";

export type OutlookReason = {
  kind: "driver" | "trend" | "unavailable";
  text: string;
};

export type TrendSeries = {
  id: string;
  featureKey: string;
  featureLabel: string;
  unit: string;
  points: FeatureTrendPointView[];
  periodLabel: string;
};

const isValidDriver = (driver: DriverContributionView) => (
  driver.key.trim().length > 0
  && driver.label.trim().length > 0
  && Number.isFinite(driver.contributionPct)
);

const signFor = (value: number) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
const signedPercentage = (value: number) => `${value > 0 ? "+" : ""}${value}%`;

export function groupTrendSeries(points: FeatureTrendPointView[]): TrendSeries[] {
  const groups = new Map<string, FeatureTrendPointView[]>();
  for (const point of points) {
    if (!point.featureKey.trim() || !point.featureLabel.trim() || !point.unit.trim()
      || !/^\d{4}-\d{2}-\d{2}$/u.test(point.weekStart) || !Number.isFinite(point.value)) continue;
    // A different supplied label remains a distinct series instead of being silently relabeled.
    const id = `${point.featureKey}\u0000${point.unit}\u0000${point.featureLabel}`;
    groups.set(id, [...(groups.get(id) ?? []), point]);
  }
  return [...groups.entries()]
    .map(([id, group]) => {
      const sorted = [...group].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      return {
        id,
        featureKey: first.featureKey,
        featureLabel: first.featureLabel,
        unit: first.unit,
        points: sorted,
        periodLabel: sorted.length === 1
          ? `1 supplied weekly observation (week starting ${first.weekStart})`
          : `${sorted.length} supplied weekly observations (weeks starting ${first.weekStart} to ${last.weekStart})`,
      };
    })
    .sort((left, right) => left.featureLabel.localeCompare(right.featureLabel) || left.unit.localeCompare(right.unit) || left.id.localeCompare(right.id));
}

export function selectOutlookReason(
  drivers: DriverContributionView[],
  trendPoints: FeatureTrendPointView[],
): OutlookReason {
  const candidates = drivers.filter(isValidDriver).filter((driver) => driver.contributionPct !== 0)
    .sort((left, right) => Math.abs(right.contributionPct) - Math.abs(left.contributionPct) || left.key.localeCompare(right.key));
  const selected = candidates[0];
  if (selected) {
    const inferredDirection = signFor(selected.contributionPct);
    const directionMatches = selected.direction === inferredDirection;
    const counterpoint = candidates.find((driver) => signFor(driver.contributionPct) !== inferredDirection);
    const directionText = directionMatches
      ? `a ${selected.direction} supplied contribution of ${signedPercentage(selected.contributionPct)}`
      : `a supplied contribution of ${signedPercentage(selected.contributionPct)}; its direction metadata is inconsistent, so no directional conclusion is available`;
    return {
      kind: "driver",
      text: `The supplied training signal ${selected.label} has ${directionText}.${counterpoint ? ` An opposing signed signal is also supplied: ${counterpoint.label} (${signedPercentage(counterpoint.contributionPct)}).` : ""} These signals provide training context for the current-fitness estimate; they do not explain or predict a finish time.`,
    };
  }
  const neutral = drivers.filter(isValidDriver).filter((driver) => driver.contributionPct === 0);
  if (neutral.length > 0) {
    return { kind: "unavailable", text: "Only neutral supplied training signals are available. They provide no directional explanation for this current-fitness estimate." };
  }
  const series = groupTrendSeries(trendPoints)[0];
  if (series) {
    const latest = series.points[series.points.length - 1]!;
    return { kind: "trend", text: `Observed ${series.featureLabel}: ${series.periodLabel}; the latest supplied value is ${latest.value} ${series.unit}. Its effect on this current-fitness estimate is unavailable.` };
  }
  return { kind: "unavailable", text: "This current-fitness estimate has no supplied explanatory evidence. Its range and limitations still apply." };
}
