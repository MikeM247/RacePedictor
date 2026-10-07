import type { ActivitySplitKmDTO } from "../contracts/activity.ts";
import type { PaceBlock } from "../contracts/activity-pace-comparison.ts";

export function paceText(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const value = Math.round(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
export function plannedPaceText(block?: PaceBlock) {
  if (!block || block.kind === "effort") return "No numeric target";
  if (block.kind === "range") return `${paceText(block.minPaceSecPerKm)}–${paceText(block.maxPaceSecPerKm)}`;
  return `${block.kind === "approximate" ? "≈" : ""}${paceText(block.paceSecPerKm)}`;
}
export function paceDifference(actual: number, block?: PaceBlock) {
  if (!Number.isFinite(actual) || actual <= 0) return "Actual pace unavailable";
  if (!block) return "No approved target";
  if (block.kind === "effort") return "Effort-led guidance";
  const value = Math.round(actual);
  const low = Math.round(block.kind === "range" ? block.minPaceSecPerKm : block.paceSecPerKm);
  const high = Math.round(block.kind === "range" ? block.maxPaceSecPerKm : block.paceSecPerKm);
  if (value >= low && value <= high) return block.kind === "range" ? "Within range" : "At guidance";
  const differences = [Math.abs(value - low), Math.abs(value - high)].sort((a, b) => a - b);
  const amount = differences[0] === differences[1] ? `${differences[0]}` : `${differences[0]}–${differences[1]}`;
  return `${block.kind === "approximate" ? "≈" : ""}${amount} s/km ${value < low ? "faster" : "slower"}`;
}
export function splitRows(splits: ActivitySplitKmDTO[], blocks: PaceBlock[] = []) {
  return [...splits].sort((a, b) => a.splitIndex - b.splitIndex).map(split => {
    const block = blocks.find(b => b.firstSplitIndex <= split.splitIndex && b.lastSplitIndex >= split.splitIndex);
    const partial = split.distanceM < 995 || split.distanceM > 1005;
    return { split, block, partial, label: partial ? `Split ${split.splitIndex + 1} · ${Math.round(split.distanceM)} m` : `Kilometre ${split.splitIndex + 1}`, actual: paceText(split.paceSecPerKm), planned: plannedPaceText(block), difference: paceDifference(split.paceSecPerKm, block) };
  });
}
export function paceDomain(splits: ActivitySplitKmDTO[], blocks: PaceBlock[]) {
  const values = splits.map(s => s.paceSecPerKm).concat(blocks.flatMap(b => b.kind === "effort" ? [] : b.kind === "range" ? [b.minPaceSecPerKm, b.maxPaceSecPerKm] : [b.paceSecPerKm])).filter(v => Number.isFinite(v) && v > 0);
  if (!values.length) return { min: 240, max: 400, step: 40 };
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const step = Math.max(10, Math.ceil((maximum - minimum + 20) / 5 / 10) * 10);
  return { min: Math.max(0, Math.floor((minimum - 5) / step) * step), max: Math.ceil((maximum + 5) / step) * step, step };
}
