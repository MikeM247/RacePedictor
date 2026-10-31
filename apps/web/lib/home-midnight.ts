import { localDateInTimezone } from "./coaching-ui-state.ts";
/** Find the next local date change without assuming a 24-hour day across DST. */
export function millisecondsUntilLocalMidnight(
  timezone: string,
  now = new Date(),
) {
  const origin = now.getTime(),
    today = localDateInTimezone(timezone, now);
  let low = origin,
    high = origin + 36 * 60 * 60 * 1000;
  while (high - low > 250) {
    const middle = Math.floor((low + high) / 2);
    if (localDateInTimezone(timezone, new Date(middle)) === today) low = middle;
    else high = middle;
  }
  return Math.max(1, high - origin);
}
