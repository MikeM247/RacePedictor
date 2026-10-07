"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityDetail } from "../../../../packages/core/src/contracts/activity.ts";
import { paceComparisonReadSchema, type PaceBlock, type PaceComparisonRead } from "../../../../packages/core/src/contracts/activity-pace-comparison.ts";
import { paceDomain, paceText, splitRows } from "../../../../packages/core/src/services/split-pacing.ts";
import "./activity-split-comparison.css";

const noBlocks: PaceBlock[] = [];
type ViewState = { view: "chart" | "table"; selected: number; start: number; mode: "all" | "detail" };
const initial: ViewState = { view: "chart", selected: 0, start: 0, mode: "all" };

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
  const [state, setState] = useState<ViewState>(initial);
  const [restored, setRestored] = useState(false);
  const [read, setRead] = useState<PaceComparisonRead["data"] | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [width, setWidth] = useState(320);
  const plot = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const focusIndex = useRef<number | null>(null);
  const buttons = useRef<Map<number, HTMLButtonElement>>(new Map());
  const storageKey = `rp-splits:${activity.athleteId}:${activity.id}`;
  useEffect(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "null") as Partial<ViewState> | null;
      if (value) setState({ view: value.view === "table" ? "table" : "chart", selected: Number.isInteger(value.selected) ? Math.max(0, Math.min(activity.splits.length - 1, value.selected!)) : 0, start: Number.isInteger(value.start) ? Math.max(0, value.start!) : 0, mode: value.mode === "detail" ? "detail" : "all" });
    } catch { /* Storage is optional, including private browsing. */ }
    setRestored(true);
  }, [storageKey, activity.splits.length]);
  useEffect(() => { if (restored) { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* In-memory navigation still works. */ } } }, [restored, state, storageKey]);
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
  }, [state.view]);

  const blocks = load === "ready" && read?.status === "ready" ? read.comparison?.blocks ?? noBlocks : noBlocks;
  const rows = useMemo(() => splitRows(activity.splits, blocks), [activity.splits, blocks]);
  const domain = useMemo(() => paceDomain(activity.splits, blocks), [activity.splits, blocks]);
  const count = Math.max(1, Math.min(10, Math.floor((width - 68) / 44)));
  const maximumStart = Math.max(0, rows.length - count);
  const start = state.mode === "all" ? 0 : Math.min(state.start, maximumStart);
  const selected = Math.min(state.selected, Math.max(0, rows.length - 1));
  const visible = state.mode === "all" ? rows : rows.slice(start, start + count);
  const selectedRow = rows[selected];
  const pageCount = visible.length;
  useEffect(() => {
    setState(previous => {
      const nextSelected = Math.min(previous.selected, Math.max(0, rows.length - 1));
      let nextStart = previous.mode === "all" ? 0 : Math.min(previous.start, maximumStart);
      if (previous.mode === "detail" && (nextSelected < nextStart || nextSelected >= nextStart + count)) nextStart = Math.min(maximumStart, nextSelected);
      return previous.start === nextStart && previous.selected === nextSelected ? previous : { ...previous, selected: nextSelected, start: nextStart };
    });
  }, [count, rows.length, maximumStart]);
  useEffect(() => {
    if (focusIndex.current !== null) { buttons.current.get(focusIndex.current)?.focus(); focusIndex.current = null; }
  }, [state.selected, state.start]);
  function move(direction: number) {
    setState(previous => {
      if (previous.mode === "all") return { ...previous, selected: Math.max(0, Math.min(rows.length - 1, previous.selected + direction)) };
      const nextStart = Math.max(0, Math.min(maximumStart, Math.min(previous.start, maximumStart) + direction * (count - 1)));
      return { ...previous, start: nextStart, selected: Math.min(rows.length - 1, nextStart + Math.floor(pageCount / 2)) };
    });
  }
  function select(index: number, focus = false) {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    if (focus) focusIndex.current = next;
    setState(previous => ({ ...previous, selected: next, start: previous.mode === "all" ? 0 : next < start ? next : next >= start + count ? Math.min(maximumStart, next - count + 1) : start }));
  }
  const height = width >= 540 ? 254 : 224, left = 52, right = 16, top = 22, bottom = height - 14;
  const cell = Math.max(1, (width - left - right) / Math.max(1, pageCount)), barWidth = Math.min(48, cell * .62);
  const x = (index: number) => left + (index + .5) * cell;
  const y = (pace: number) => top + (pace - domain.min) / (domain.max - domain.min) * (bottom - top);
  const ticks: number[] = [];
  for (let value = domain.min; value <= domain.max; value += domain.step) ticks.push(value);
  if (!rows.length) return <p>No split data was included in this imported activity.</p>;

  return <section className="pace-comparison" aria-label="Split pace comparison">
    <div className="pace-toolbar"><div className="pace-source">
      {load === "loading" ? <span role="status">Loading planned comparison…</span> : load === "error" ? <span role="status">Planned comparison could not be loaded. <button type="button" className="pace-text-button" onClick={() => setRetry(value => value + 1)}>Retry comparison</button></span> : read?.comparison ? <><span>Compared with: {read.comparison.source.sessionTitle}</span><small>Reviewed comparison · Plan {read.comparison.source.planVersion}{read.status === "stale" ? " · split data changed; re-review required" : ""}</small></> : <span>No approved pace comparison. Showing actual splits.</span>}
    </div><div className="pace-toolbar-controls"><div className="pace-view" aria-label="Split display">{(["chart", "table"] as const).map(view => <button key={view} type="button" aria-pressed={state.view === view} onClick={() => setState(previous => ({ ...previous, view }))}>{view === "chart" ? "Chart" : "Table"}</button>)}</div><div className="pace-view pace-mode" aria-label="Chart detail">{(["all", "detail"] as const).map(mode => <button key={mode} type="button" aria-pressed={state.mode === mode} onClick={() => setState(previous => ({ ...previous, mode, start: mode === "all" ? 0 : Math.min(maximumStart, Math.max(0, previous.selected - Math.floor(count / 2))) }))}>{mode === "all" ? "All splits" : "Detail"}</button>)}</div></div></div>
    <div hidden={state.view !== "chart"}>
      <div className="pace-legend"><span><i className="pace-swatch" aria-hidden="true" />Actual pace</span>{blocks.some(block => block.kind !== "effort") ? <span><i className="pace-swatch pace-swatch-plan" aria-hidden="true" />Planned pace / range</span> : null}</div>
      <div className="pace-axis-caption"><span>Pace (min/km)</span><span>Faster ↑</span></div>
      <div className="pace-plot" ref={plot} onPointerDown={event => {
        if ((event.target as Element).closest("button")) return;
        pointer.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerCancel={() => { pointer.current = null; }} onPointerUp={event => {
        if (!pointer.current) return;
        const dx = event.clientX - pointer.current.x, dy = event.clientY - pointer.current.y; pointer.current = null;
        if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
        else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { const rect = event.currentTarget.getBoundingClientRect(); select(start + Math.max(0, Math.min(visible.length - 1, Math.floor((event.clientX - rect.left - left) / cell)))); }
      }}>
        <svg className="pace-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Actual pace bars for splits ${start + 1} to ${start + visible.length}, with approved planned target outlines where available. Taller bars mean faster pace on the displayed scale. Exact values are available in the split selector and table.`}>
          {ticks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="pace-grid" /><text x={left - 9} y={y(tick) + 4} textAnchor="end">{tick === 0 ? "0:00" : paceText(tick)}</text></g>)}
          {visible.map((row, index) => {
            const active = index + start === selected, block = row.block;
            const barX = x(index) - barWidth / 2;
            const target = !block || block.kind === "effort" ? null : block.kind === "range" ? (block.minPaceSecPerKm + block.maxPaceSecPerKm) / 2 : block.paceSecPerKm;
            const valid = Number.isFinite(row.split.paceSecPerKm) && row.split.paceSecPerKm > 0;
            return <g key={row.split.id}>
              {block?.kind === "effort" ? <rect x={x(index) - cell / 2} y={top} width={cell} height={bottom - top} className="pace-effort-region" /> : null}
              {active ? <rect x={x(index) - cell / 2 + 2} y={top} width={Math.max(1, cell - 4)} height={bottom - top} rx={5} className="pace-selection-guide" /> : null}
              {block?.kind === "range" ? <rect x={barX} y={y(block.minPaceSecPerKm)} width={barWidth} height={Math.max(1, y(block.maxPaceSecPerKm) - y(block.minPaceSecPerKm))} className="pace-range" /> : null}
              {valid ? <rect data-split-bar={row.split.splitIndex} x={barX} y={y(row.split.paceSecPerKm)} width={barWidth} height={Math.max(0, bottom - y(row.split.paceSecPerKm))} rx={2} className={`pace-bar${active ? " pace-bar-selected" : ""}`} /> : <text x={x(index)} y={bottom - 8} textAnchor="middle">—</text>}
              {target !== null ? <><rect data-plan-target={row.split.splitIndex} x={barX} y={y(target)} width={barWidth} height={Math.max(0, bottom - y(target))} fill="none" className="pace-target-underlay" /><rect data-plan-target={row.split.splitIndex} x={barX} y={y(target)} width={barWidth} height={Math.max(0, bottom - y(target))} fill="none" className="pace-target" /></> : null}
            </g>;
          })}
        </svg>
        {width - left - right >= pageCount * 44 ? <div className="pace-split-selectors" style={{ gridTemplateColumns: `repeat(${pageCount}, minmax(0, 1fr))` }} aria-label="Select split">{visible.map((row, index) => <button key={row.split.id} ref={node => { if (node) buttons.current.set(start + index, node); else buttons.current.delete(start + index); }} type="button" aria-pressed={start + index === selected} aria-label={`${row.label}, actual ${row.actual} per kilometre, planned ${row.planned}`} onClick={() => select(start + index)} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); select(start + index + (event.key === "ArrowRight" ? 1 : -1), true); } }}>{row.split.splitIndex + 1}{row.partial ? "*" : ""}</button>)}</div> : null}
      </div>
      <p className="pace-swipe-hint">Swipe chart to explore · tap a split</p>
      <div className="pace-navigation"><span aria-live="polite">Splits {start + 1}–{start + visible.length} of {rows.length}</span><div><span className="pace-click-hint">{state.mode === "all" ? "Select a split for details" : "Explore the next splits"}</span><button type="button" aria-label={state.mode === "all" ? "Previous split" : "Previous splits"} disabled={state.mode === "all" ? selected === 0 : start === 0} onClick={() => move(-1)}>←</button><button type="button" aria-label={state.mode === "all" ? "Next split" : "Next splits"} disabled={state.mode === "all" ? selected >= rows.length - 1 : start + count >= rows.length} onClick={() => move(1)}>→</button></div></div>
      {state.mode === "detail" ? <div className="pace-progress" aria-hidden="true"><span style={{ width: `${visible.length / rows.length * 100}%`, marginLeft: `${start / rows.length * 100}%` }} /></div> : null}
      <div className="pace-readout-controls"><label>Choose split<select aria-label="Choose split" value={selected} onChange={event => select(Number(event.target.value))}>{rows.map((row, index) => <option key={row.split.id} value={index}>{row.label}</option>)}</select></label><div><button type="button" aria-label="Previous split" disabled={selected === 0} onClick={() => select(selected - 1)}>← Previous</button><button type="button" aria-label="Next split" disabled={selected >= rows.length - 1} onClick={() => select(selected + 1)}>Next →</button></div></div>
      {selectedRow ? <><dl className="pace-readout" aria-live="polite"><div className="pace-selected-label"><dt>Selected split</dt><dd>{selectedRow.label}</dd></div><div><dt>Actual /km</dt><dd>{selectedRow.actual}</dd></div><div><dt>Planned /km</dt><dd>{selectedRow.planned}</dd></div><div className="pace-difference"><dt>Compared with plan</dt><dd>{selectedRow.difference}</dd></div></dl>{selectedRow.block ? <p className="pace-phase"><strong>{selectedRow.block.label}</strong>{selectedRow.block.kind === "effort" ? ` — ${selectedRow.block.guidance}` : ""}</p> : null}</> : null}
    </div>
    <div className="pace-table-wrap" hidden={state.view !== "table"}><table><caption className="sr-only">Recorded and approved planned split paces</caption><thead><tr><th scope="col">Split</th><th scope="col">Actual /km</th><th scope="col">Planned /km</th><th scope="col">Difference</th></tr></thead><tbody>{rows.map(row => <tr key={row.split.id}><th scope="row">{row.label}</th><td>{row.actual}</td><td>{row.planned}{row.block?.kind === "effort" ? <small>{row.block.guidance}</small> : null}</td><td>{row.difference}</td></tr>)}</tbody></table></div>
    <p className="pace-footnote">Recorded splits are not official course splits.{rows.some(row => row.partial) ? " * Partial or non-standard split; recorded distance shown in details and table." : ""}{blocks.some(block => block.kind === "effort") ? " Effort-led blocks have no numeric target." : ""}</p>
  </section>;
}
