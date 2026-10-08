"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityDetail } from "../../../../packages/core/src/contracts/activity.ts";
import { paceComparisonReadSchema, type PaceBlock, type PaceComparisonRead } from "../../../../packages/core/src/contracts/activity-pace-comparison.ts";
import { paceDomain, paceText, splitRows } from "../../../../packages/core/src/services/split-pacing.ts";
import "./activity-split-comparison.css";

const noBlocks: PaceBlock[] = [];

export function ActivitySplits({ activity, initiallyOpen, onOpenChange }: { activity: ActivityDetail; initiallyOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(initiallyOpen ?? activity.splits.length > 0);
  const key = `rp-splits-open:${activity.athleteId}:${activity.id}`;
  useEffect(() => { try { const saved = sessionStorage.getItem(key); if (saved !== null) setOpen(saved === "true"); } catch { /* Optional session state. */ } }, [key]);
  return <details className="detail-disclosure" open={open}><summary onClick={event => {
    event.preventDefault();
    const next = !open; setOpen(next); onOpenChange?.(next);
    try { sessionStorage.setItem(key, String(next)); } catch { /* Optional session state. */ }
  }}>Splits <span>{activity.splits.length ? `${activity.splits.length} splits` : "Unavailable"}</span></summary><ActivitySplitComparison activity={activity} /></details>;
}

export function ActivitySplitComparison({ activity }: { activity: ActivityDetail }) {
  const [width, setWidth] = useState(320);
  const [read, setRead] = useState<PaceComparisonRead["data"] | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const plot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoad("loading"); setRead(null);
    void fetch(`/api/v1/activities/${encodeURIComponent(activity.id)}/pace-comparison`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Comparison unavailable");
      const result = paceComparisonReadSchema.parse(await response.json());
      if (result.data.activityId !== activity.id) throw new Error("Unexpected comparison identity");
      if (!controller.signal.aborted) { setRead(result.data); setLoad("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setLoad("error"); });
    return () => controller.abort();
  }, [activity.id, activity.splits, retry]);

  useEffect(() => {
    if (!plot.current) return;
    const observer = new ResizeObserver(entries => { const next = entries[0]?.contentRect.width; if (next && next > 0) setWidth(next); });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);

  const blocks = load === "ready" && read?.status === "ready" ? read.comparison?.blocks ?? noBlocks : noBlocks;
  const rows = useMemo(() => splitRows(activity.splits, blocks), [activity.splits, blocks]);
  const domain = useMemo(() => paceDomain(activity.splits, blocks), [activity.splits, blocks]);
  const paceBounds = useMemo(() => {
    const valid = rows.map(row => row.split.paceSecPerKm).filter(value => Number.isFinite(value) && value > 0);
    return { fastest: Math.min(...valid), slowest: Math.max(...valid) };
  }, [rows]);
  const height = width >= 540 ? 260 : 230, left = 48, right = 10, top = 18, bottom = height - 28;
  const cell = Math.max(0.1, (width - left - right) / Math.max(1, rows.length));
  const barWidth = Math.min(24, cell * .62);
  const x = (index: number) => left + (index + .5) * cell;
  const y = (pace: number) => top + (pace - domain.min) / (domain.max - domain.min) * (bottom - top);
  const ticks: number[] = [];
  for (let value = domain.min; value <= domain.max; value += domain.step) ticks.push(value);
  const tickEvery = Math.max(1, Math.ceil(48 / cell));
  const tickIndices = rows.map((_, index) => index).filter(index => index === 0 || index === rows.length - 1 || index % tickEvery === 0);
  while (tickIndices.length > 1 && (tickIndices[tickIndices.length - 1] - tickIndices[tickIndices.length - 2]) * cell < 48) tickIndices.splice(tickIndices.length - 2, 1);
  const paceBarPercent = (pace: number) => {
    if (!Number.isFinite(pace) || pace <= 0) return 0;
    if (paceBounds.fastest === paceBounds.slowest) return 65;
    return Math.round(20 + (paceBounds.slowest - pace) / (paceBounds.slowest - paceBounds.fastest) * 80);
  };

  if (!rows.length) return <p>No split data was included in this imported activity.</p>;

  return <section className="pace-comparison" aria-label="Split pace comparison">
    <div className="pace-toolbar"><div className="pace-source">
      {load === "loading" ? <span role="status">Loading planned comparison…</span> : load === "error" ? <span role="status">Planned comparison could not be loaded. <button type="button" className="pace-text-button" onClick={() => setRetry(value => value + 1)}>Retry comparison</button></span> : read?.comparison ? <><span>Compared with: {read.comparison.source.sessionTitle}</span><small>Reviewed comparison · Plan {read.comparison.source.planVersion}{read.status === "stale" ? " · split data changed; re-review required" : ""}</small></> : <span>No approved pace comparison. Showing actual splits.</span>}
    </div></div>

    <div className="pace-legend"><span><i className="pace-swatch" aria-hidden="true" />Actual pace</span>{blocks.some(block => block.kind !== "effort") ? <span><i className="pace-swatch pace-swatch-plan" aria-hidden="true" />Target per km</span> : null}</div>
    <div className="pace-axis-caption"><span>Pace (min/km)</span></div>
    <div className="pace-plot" ref={plot}>
      <svg className="pace-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Actual pace for all ${rows.length} recorded splits. Dotted marks show the approved target for each individual kilometre; paired marks show target ranges. Exact values are listed in the table below.`}>
        {ticks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="pace-grid" /><text x={left - 8} y={y(tick) + 4} textAnchor="end">{tick === 0 ? "0:00" : paceText(tick)}</text></g>)}
        {rows.map((row, index) => {
          const block = row.block;
          const barX = x(index) - barWidth / 2;
          const valid = Number.isFinite(row.split.paceSecPerKm) && row.split.paceSecPerKm > 0;
          const markHalfWidth = Math.max(.05, cell * .35);
          const targets = !block || block.kind === "effort" ? [] : block.kind === "range"
            ? [{ bound: "min", pace: block.minPaceSecPerKm }, { bound: "max", pace: block.maxPaceSecPerKm }]
            : [{ bound: "pace", pace: block.paceSecPerKm }];
          return <g key={row.split.id}>
            {valid ? <rect data-split-bar={row.split.splitIndex} x={barX} y={y(row.split.paceSecPerKm)} width={barWidth} height={Math.max(0, bottom - y(row.split.paceSecPerKm))} rx={Math.min(2, barWidth / 3)} className="pace-bar" /> : null}
            {targets.map(({ bound, pace }) => <line key={`${row.split.id}-${bound}`} data-plan-target={row.split.splitIndex} data-target-bound={bound} data-target-pace-seconds={pace} x1={x(index) - markHalfWidth} x2={x(index) + markHalfWidth} y1={y(pace)} y2={y(pace)} className="pace-target" />)}
          </g>;
        })}
        {tickIndices.map(index => <text key={index} data-split-tick-index={index} x={x(index)} y={height - 5} textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"}>{index === rows.length - 1 ? `${rows[index].split.splitIndex + 1} km` : rows[index].split.splitIndex + 1}</text>)}
      </svg>
    </div>
    <p className="pace-target-note">Dotted marks show each kilometre’s target. Two marks indicate a target range.</p>

    <div className="pace-table-section">
      <h3>Kilometre splits</h3>
      <p className="pace-table-caption">Pace and target in min/km</p>
      <div className="pace-table-wrap"><table>
        <caption className="sr-only">Recorded pace and approved target by split</caption>
        <colgroup><col className="pace-col-km" /><col className="pace-col-actual" /><col className="pace-col-target" /><col className="pace-col-bar" /></colgroup>
        <thead><tr><th scope="col">Km</th><th scope="col">Pace</th><th scope="col">Target</th><th scope="col"><span className="sr-only">Relative pace</span></th></tr></thead>
        <tbody>{rows.map(row => {
          const barPercent = paceBarPercent(row.split.paceSecPerKm);
          const planned = row.block?.kind === "effort" ? "Effort-led" : row.block ? row.planned : "No approved target";
          return <tr key={row.split.id}>
            <th scope="row">{row.partial ? `Split ${row.split.splitIndex + 1} · ${Math.round(row.split.distanceM)} m` : row.split.splitIndex + 1}</th>
            <td className="pace-actual-value">{row.actual}</td>
            <td className="pace-planned-value">{planned}{row.block?.kind === "effort" ? <small>{row.block.guidance}</small> : null}</td>
            <td className="pace-bar-cell" aria-hidden="true"><span className="pace-bar-track"><span data-pace-bar={row.split.splitIndex} style={{ width: `${barPercent}%` }} /></span></td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>
    <p className="pace-footnote">Recorded splits are not official course splits.{rows.some(row => row.partial) ? " Partial or non-standard splits are labelled with their recorded distance." : ""}{blocks.some(block => block.kind === "effort") ? " Effort-led guidance has no numeric target." : ""}</p>
  </section>;
}
