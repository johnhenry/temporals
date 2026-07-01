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
 * Whether `zdt` is in daylight saving time — heuristically, whether its offset
 * is greater than the zone's standard (winter) offset, estimated from January
 * vs July. Correct for the common +1h-in-summer zones (both hemispheres);
 * zones with no DST return `false`. (Negative-DST zones like Europe/Dublin are
 * the known heuristic edge case.)
 */
export function isDST(zdt: ZDT): boolean {
  const standard = Math.min(offsetAtMonth(zdt, 1), offsetAtMonth(zdt, 7));
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
