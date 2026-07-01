import type { Temporal } from "temporal-polyfill";
import { cmp } from "./internal.js";

/**
 * DST / time-zone-transition helpers — thin, honest wrappers over Temporal's
 * `getTimeZoneTransition` and offset data.
 */

type ZDT = Temporal.ZonedDateTime;

function offsetAtMonth(zdt: ZDT, month: number): number {
  return zdt.with({ month, day: 1, hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
    .offsetNanoseconds;
}

/**
 * Whether `zdt` is in daylight saving time — defined precisely as: its offset
 * exceeds the zone's minimum (standard) offset across that calendar year. This
 * is correct for the standard "+1h in summer" zones in both hemispheres and
 * returns `false` for zones without DST. Zones modelled with *negative* DST
 * (e.g. Europe/Dublin, where winter is the shifted period) are inherently
 * ambiguous under any single definition — treat the result there as advisory.
 */
export function isDST(zdt: ZDT): boolean {
  let standard = Infinity;
  for (let m = 1; m <= 12; m++) standard = Math.min(standard, offsetAtMonth(zdt, m));
  return zdt.offsetNanoseconds > standard;
}

/** The next UTC-offset transition at or after `zdt`, or `null` if the zone has none ahead. */
export function nextTransition(zdt: ZDT): ZDT | null {
  return zdt.getTimeZoneTransition("next");
}

/** The previous UTC-offset transition before `zdt`, or `null`. */
export function previousTransition(zdt: ZDT): ZDT | null {
  return zdt.getTimeZoneTransition("previous");
}

/** All offset transitions in `[start, end)`, ascending. */
export function transitionsBetween(start: ZDT, end: ZDT): ZDT[] {
  const out: ZDT[] = [];
  let t = start.getTimeZoneTransition("next");
  while (t && cmp(t, end) < 0) {
    out.push(t);
    t = t.getTimeZoneTransition("next");
  }
  return out;
}
