"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { WeeklyTrainingWeek } from "../../../../packages/core/src/contracts/weekly-training.ts";
import { trainingLocalDate, trainingMonday } from "../../../../packages/core/src/services/weekly-training.ts";
import { axisTickText, distanceCeiling, metricText, overlays, overlayScale, weekLabel, type OverlayKey } from "../../lib/weekly-training-chart-model.ts";
import "./weekly-training-chart.css";

type Props = {
  weeks: WeeklyTrainingWeek[];
  legacy: boolean;
  message: string | null;
  loading?: boolean;
  stale?: boolean;
  timezone?: string;
  generatedAt?: string;
  onRetry?: () => void;
};

export function WeeklyTrainingChart({ weeks: suppliedWeeks, legacy, message, loading, stale, timezone, generatedAt, onRetry }: Props) {
  const [selected, setSelected] = useState<OverlayKey[]>([]);
  const [axisKey, setAxisKey] = useState<OverlayKey | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [width, setWidth] = useState(320);
  const [currentWeek, setCurrentWeek] = useState<string | null>(null);
  useEffect(() => {
    setCurrentWeek(trainingMonday(trainingLocalDate(new Date().toISOString(), timezone ?? "Africa/Johannesburg")));
  }, [timezone]);
  // A saved snapshot's final week is not necessarily still the current week.
  const weeks = suppliedWeeks.map(week => ({ ...week, isCurrentWeek: week.isCurrentWeek && week.weekStart === currentWeek }));
  const historicalSnapshot = !legacy && currentWeek !== null && suppliedWeeks.length > 0 && suppliedWeeks.at(-1)!.weekStart < currentWeek;
  const container = useRef<HTMLDivElement>(null);
  const id = useId().replaceAll(":", "");
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [weeks.length, loading, message]);

  const active = hovered ?? (pinned === null ? null : Math.min(pinned, weeks.length - 1));
  const week = active === null ? null : weeks[active];
  const enabled = overlays.filter(metric => selected.includes(metric.key) && weeks.some(item => item[metric.key] !== null));
  const effectiveAxisKey = enabled.some(metric => metric.key === axisKey) ? axisKey : enabled[0]?.key ?? null;
  const axisMetric = overlays.find(metric => metric.key === effectiveAxisKey);
  const axisScale = effectiveAxisKey ? overlayScale(weeks, effectiveAxisKey) : null;
  const lineScales = new Map(enabled.map(metric => [metric.key, overlayScale(weeks, metric.key)]));
  const height = width >= 540 ? 300 : 250;
  const left = 36, right = 86, top = 30, bottom = height - 34;
  const plotWidth = Math.max(1, width - left - right);
  const cell = plotWidth / Math.max(1, weeks.length);
  const barWidth = Math.min(44, cell * 0.62);
  const ceiling = distanceCeiling(weeks);
  const x = (index: number) => left + (index + .5) * cell;
  const y = (distanceM: number) => bottom - (distanceM / 1000 / ceiling) * (bottom - top);
  const overlayTop = top + 12, overlayBottom = bottom - 12;
  const overlayY = (scale: NonNullable<ReturnType<typeof overlayScale>>, value: number) => overlayBottom - scale.normalize(value) * (overlayBottom - overlayTop);
  const labelEvery = Math.max(1, Math.ceil(weeks.length / Math.max(2, Math.floor(plotWidth / 62))));
  const selectWeek = (index: number) => {
    const next = Math.max(0, Math.min(weeks.length - 1, index));
    setHovered(null); setPinned(next);
    const item = weeks[next];
    setAnnouncement(`Week of ${weekLabel(item.weekStart)}. Distance ${metricText("distanceM", item.distanceM)}. ${enabled.map(metric => `${metric.detail} ${metricText(metric.key, item[metric.key])}`).join(". ")}`);
  };
  const clearSelection = () => { setPinned(null); setHovered(null); setAnnouncement("Week selection cleared."); };

  return <section className="weekly-training" aria-labelledby={`${id}-heading`}>
    <div className="weekly-training-heading"><div><h3 id={`${id}-heading`}>Weekly training</h3>
      {weeks.length > 0 ? <p>{weeks.length} weeks · {weekLabel(weeks[0].weekStart)} – {weekLabel(weeks.at(-1)!.weekStart)} {weeks.at(-1)!.weekStart.slice(0, 4)}</p> : null}
    </div><span className="weekly-training-badge">{enabled.length ? `${enabled.length} overlay${enabled.length === 1 ? "" : "s"}` : "Distance only"}</span></div>
    <p className="quiet-copy">Observed training does not establish readiness, adherence, or target-race performance.</p>
    {loading ? <p role="status">Loading weekly training…</p> : message ? <div role="status"><p>{message}</p>{onRetry ? <button type="button" className="button button-secondary" onClick={onRetry}>Retry weekly training</button> : null}</div> : <>
      <div className="weekly-training-controls"><strong className="weekly-distance-key">■ Distance · km</strong>
        <fieldset><legend>Overlay (select any)</legend>{overlays.map(metric => {
          const available = weeks.some(item => item[metric.key] !== null);
          return <label className={`weekly-toggle weekly-${metric.key}`} key={metric.key}>
            <input type="checkbox" checked={selected.includes(metric.key)} disabled={!available} onChange={event => {
              if (event.target.checked) {
                setSelected(previous => [...previous, metric.key]);
                if (enabled.length === 0) setAxisKey(metric.key);
              } else {
                setSelected(previous => previous.filter(key => key !== metric.key));
                if (axisKey === metric.key) setAxisKey(enabled.find(candidate => candidate.key !== metric.key)?.key ?? null);
              }
            }} />
            <span aria-hidden="true">{metric.symbol}</span> {metric.label}{!available ? <small>Unavailable</small> : null}
          </label>;
        })}</fieldset>
      </div>
      {legacy ? <p className="quiet-copy">Historical distance observations. Overlays are unavailable in this snapshot; refresh your training data to include them.</p> : null}
      {stale || historicalSnapshot ? <p role="status">Showing previously available training data. Updates are delayed.</p> : null}
      <div className="weekly-training-axis-labels"><span>Distance (km)</span>{axisMetric ? <span className={`weekly-${axisMetric.key}`}>{axisMetric.symbol} {axisMetric.key === "avgPaceSecPerKm" ? "Avg pace (min/km)" : axisMetric.key === "elapsedTimeS" ? `Elapsed time (${axisScale && axisScale.step < 60 ? "h:mm:ss" : "h:mm"})` : "Elevation gain (m)"}</span> : null}</div>
      {enabled.length > 1 && effectiveAxisKey ? <label className="weekly-training-axis-select">Right axis
        <select aria-label="Right axis" value={effectiveAxisKey} onChange={event => setAxisKey(event.target.value as OverlayKey)}>
          {enabled.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
        </select>
      </label> : null}
      <div ref={container} className="weekly-training-plot" role="group" tabIndex={0} aria-label="Weekly training chart. Use arrow keys to select a week, Home or End to jump, and Escape to clear." aria-describedby={`${id}-help`} onPointerLeave={() => setHovered(null)} onKeyDown={event => {
        if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " ", "Escape"].includes(event.key)) event.preventDefault();
        if (event.key === "Escape") clearSelection();
        else if (event.key === "Home") selectWeek(0);
        else if (event.key === "End") selectWeek(weeks.length - 1);
        else if (event.key === "ArrowLeft") selectWeek((pinned ?? weeks.length) - 1);
        else if (event.key === "ArrowRight") selectWeek(pinned === null ? 0 : pinned + 1);
        else if (event.key === "Enter" || event.key === " ") selectWeek(active ?? weeks.length - 1);
      }}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>Weekly distance with optional training overlays</title>
          <desc id={`${id}-description`}>{axisMetric ? `Distance bars start at zero kilometres. The right axis shows ${axisMetric.label}; other lines use separate scales. Select a week for all values.` : "Distance bars start at zero kilometres. Select an overlay to show its numeric right axis."} Exact values are available in the weekly data table.</desc>
          <defs><pattern id={`${id}-partial`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" className="weekly-bar" /><rect width="2" height="6" fill="var(--rp-surface)" /></pattern></defs>
          {Array.from({ length: 6 }, (_, index) => {
            const value = ceiling * index / 5, position = y(value * 1000);
            return <g key={index}><line x1={left} x2={width - right} y1={position} y2={position} className={index === 0 ? "weekly-baseline" : "weekly-grid"} /><text x={left - 8} y={position + 4} textAnchor="end">{Number(value.toFixed(1))}</text></g>;
          })}
          {axisMetric && axisScale ? <g data-right-axis={axisMetric.label} className={`weekly-right-axis weekly-${axisMetric.key}`}>
            <line x1={width - right} x2={width - right} y1={overlayTop} y2={overlayBottom} />
            {axisScale.ticks.filter((_, index, ticks) => {
              const target = width < 400 ? 3 : 5;
              const stride = Math.max(1, Math.ceil((ticks.length - 1) / target));
              return index === 0 || index === ticks.length - 1 || index % stride === 0;
            }).map(value => <g key={value}>
              <line x1={width - right - 4} x2={width - right} y1={overlayY(axisScale, value)} y2={overlayY(axisScale, value)} />
              <text x={width - right + 7} y={overlayY(axisScale, value) + 4} textAnchor="start">{axisTickText(axisMetric.key, value, axisScale.step)}</text>
            </g>)}
          </g> : null}
          {weeks.map((item, index) => <g key={item.weekStart}>
            {item.distanceM === null ? <text x={x(index)} y={bottom - 8} textAnchor="middle">—</text> : <rect data-week-bar={item.weekStart} x={x(index) - barWidth / 2} y={y(item.distanceM)} width={barWidth} height={bottom - y(item.distanceM)} className="weekly-bar" style={item.isCurrentWeek ? { fill: `url(#${id}-partial)` } : undefined} />}
            {item.distanceM === 0 ? <circle cx={x(index)} cy={bottom} r="2" className="weekly-bar" /> : null}
            {cell >= 47 && item.distanceM !== null ? <text x={x(index)} y={y(item.distanceM) - 8} textAnchor="middle">{(item.distanceM / 1000).toFixed(1)}</text> : null}
            {(index === 0 || index === weeks.length - 1 || (index % labelEvery === 0 && index < weeks.length - labelEvery)) ? <text x={x(index)} y={bottom + 24} textAnchor="middle">{weekLabel(item.weekStart)}</text> : null}
          </g>)}
          {enabled.map(metric => {
            const scale = lineScales.get(metric.key);
            if (!scale) return null;
            const values = scale.values;
            const pointY = (value: number) => overlayY(scale, value);
            return <g className={`weekly-line weekly-${metric.key}`} key={metric.key} data-overlay={metric.label}>
              {values.map((value, index) => value === null ? null : <g key={weeks[index].weekStart}>
                {index > 0 && values[index - 1] !== null ? <line x1={x(index - 1)} x2={x(index)} y1={pointY(values[index - 1]!)} y2={pointY(value)} /> : null}
                {metric.key === "avgPaceSecPerKm" ? <circle cx={x(index)} cy={pointY(value)} r="3" /> : metric.key === "elapsedTimeS" ? <rect x={x(index) - 3} y={pointY(value) - 3} width="6" height="6" /> : <path d={`M ${x(index)} ${pointY(value) - 4} l 4 7 h -8 Z`} />}
              </g>)}
            </g>;
          })}
          {active !== null ? <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} className="weekly-selection" /> : null}
          {weeks.map((item, index) => <rect key={item.weekStart} data-week-hit={item.weekStart} x={left + index * cell} y={top} width={cell} height={bottom - top} fill="transparent" onPointerMove={event => { if (event.pointerType === "mouse") setHovered(index); }} onClick={() => selectWeek(index)} />)}
        </svg>
      </div>
      <p id={`${id}-help`} className="quiet-copy">{axisMetric ? `Right axis shows ${axisMetric.label}. Other lines use separate scales. Select a week for all values.` : "Hover or tap a week for details. You can also use the arrow keys."} {selected.includes("avgPaceSecPerKm") ? "Lower pace = faster." : ""}</p>
      <div className="weekly-training-week-controls"><button type="button" onClick={() => selectWeek((pinned ?? weeks.length) - 1)} disabled={pinned === 0}>Previous week</button><button type="button" onClick={() => selectWeek(pinned === null ? 0 : pinned + 1)} disabled={pinned === weeks.length - 1}>Next week</button>{pinned !== null ? <button type="button" onClick={clearSelection}>Clear selection</button> : null}</div>
      <span className="weekly-sr-only" role="status">{announcement}</span>
      {week ? <div className="weekly-training-readout"><strong>Week of {weekLabel(week.weekStart)} {week.weekStart.slice(0, 4)}</strong><dl><div><dt className="weekly-distance-key">■ Distance</dt><dd>{metricText("distanceM", week.distanceM)}</dd></div>{enabled.map(metric => <div key={metric.key}><dt className={`weekly-${metric.key}`}>{metric.symbol} {metric.detail}</dt><dd>{metricText(metric.key, week[metric.key])}</dd></div>)}</dl>{week.isCurrentWeek ? <p>Current week · partial</p> : null}{week.coverage !== "recorded" ? <p>{week.coverage === "unknown" ? "Observation unavailable" : "No recorded runs"}</p> : null}</div> : null}
      <div className="weekly-training-footnotes"><span>Weeks start Monday{timezone ? ` · ${timezone}` : ""} · Missing observations shown as gaps</span>{weeks.some(item => item.isCurrentWeek) ? <span>▧ Current week · partial</span> : null}{generatedAt ? <span>Data as of {new Intl.DateTimeFormat("en-ZA", { timeZone: timezone ?? "UTC", dateStyle: "medium" }).format(new Date(generatedAt))}</span> : null}</div>
      <details className="weekly-training-data"><summary>View weekly data</summary><div className="weekly-training-table-wrap" tabIndex={0} role="region" aria-label="Weekly training values"><table><caption>Recorded weekly training</caption><thead><tr><th scope="col">Week starting</th><th scope="col">Distance</th><th scope="col">Avg pace</th><th scope="col">Elapsed time</th><th scope="col">Elevation gain</th><th scope="col">Notes</th></tr></thead><tbody>{weeks.map(item => <tr key={item.weekStart}><th scope="row"><time dateTime={item.weekStart}>{item.weekStart}</time></th><td>{metricText("distanceM", item.distanceM)}</td>{overlays.map(metric => <td key={metric.key}>{metricText(metric.key, item[metric.key])}</td>)}<td>{[item.isCurrentWeek ? "Current week · partial" : "", item.coverage === "unknown" ? "Unavailable" : item.coverage === "no_recorded_runs" ? "No recorded runs" : ""].filter(Boolean).join(" · ") || "Recorded"}</td></tr>)}</tbody></table></div></details>
      <details className="weekly-training-definitions"><summary>About these metrics</summary><p>Pace is a distance-weighted average of recorded run paces. Time is total elapsed running time, including pauses. Elevation is total recorded gain. Some older imports store missing elevation as zero. Only recorded runs are included; missing imports can affect totals.</p></details>
    </>}
  </section>;
}
