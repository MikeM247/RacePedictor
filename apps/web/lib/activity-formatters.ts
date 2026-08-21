const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatActivityDate(localOccurredAt: string | null | undefined, occurredAt: string): string {
  const source = localOccurredAt ?? occurredAt;
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return source;
  const [, year, month, day, hour, minute] = match;
  return `${day} ${MONTHS[Number(month) - 1]} ${year} · ${hour}:${minute}`;
}

export function formatDistance(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

export function formatDuration(durationS: number): string {
  const totalSeconds = Math.max(0, Math.round(durationS));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPace(paceSecPerKm: number | null | undefined): string {
  if (paceSecPerKm === null || paceSecPerKm === undefined || paceSecPerKm <= 0) return "—";
  const rounded = Math.round(paceSecPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

export function formatNumber(
  value: number | null | undefined,
  suffix = "",
  maximumFractionDigits = 0,
): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("en-ZA", { maximumFractionDigits })}${suffix}`;
}

export function sportLabel(sport: string): string {
  return sport.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
