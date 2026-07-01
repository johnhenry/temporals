import type { Temporal } from "temporal-polyfill";
import type { TemporalPoint } from "./types.js";
import { kindOf } from "./internal.js";
import { getTemporal } from "./temporal.js";

/**
 * Duration humanising, relative-time formatting, and shorthand parsing.
 * Public entry for the `temporals/humanize` subpath.
 */

const FIELDS: [string, string, string][] = [
  ["years", "year", "y"],
  ["months", "month", "mo"],
  ["weeks", "week", "w"],
  ["days", "day", "d"],
  ["hours", "hour", "h"],
  ["minutes", "minute", "m"],
  ["seconds", "second", "s"],
];

export interface HumanizeOptions {
  /** Abbreviated form (`2d 3h` instead of `2 days, 3 hours`). */
  short?: boolean;
  /** Keep at most this many (largest) units. */
  max?: number;
}

/**
 * A human-readable duration, reading the units present on the `Duration` as-is.
 * Balance/round the duration first if you want e.g. `90 minutes` shown as
 * `1 hour, 30 minutes`.
 */
export function humanizeDuration(duration: Temporal.Duration, opts: HumanizeOptions = {}): string {
  const { short = false, max = Infinity } = opts;
  const d = duration as unknown as Record<string, number>;
  const parts: string[] = [];
  for (const [field, long, abbr] of FIELDS) {
    const v = d[field] ?? 0;
    if (v === 0) continue;
    parts.push(short ? `${v}${abbr}` : `${v} ${long}${Math.abs(v) === 1 ? "" : "s"}`);
    if (parts.length >= max) break;
  }
  if (parts.length === 0) return short ? "0s" : "0 seconds";
  return parts.join(short ? " " : ", ");
}

const REL_ORDER: [string, Intl.RelativeTimeFormatUnit][] = [
  ["years", "year"],
  ["months", "month"],
  ["weeks", "week"],
  ["days", "day"],
  ["hours", "hour"],
  ["minutes", "minute"],
  ["seconds", "second"],
];

export interface RelativeOptions {
  locale?: string | string[];
  numeric?: "always" | "auto";
}

/**
 * Format `to` relative to `from` ("in 5 minutes", "3 days ago") via
 * `Intl.RelativeTimeFormat`, using the largest non-zero unit.
 */
export function formatRelative<T extends TemporalPoint>(from: T, to: T, opts: RelativeOptions = {}): string {
  const k = kindOf(from);
  const largestUnit = k === "time" || k === "instant" ? "hour" : "year";
  const dur = (from as unknown as { until(o: T, opt: object): Temporal.Duration }).until(to, {
    largestUnit,
  });
  const rtf = new Intl.RelativeTimeFormat(opts.locale as string | undefined, {
    numeric: opts.numeric ?? "auto",
  });
  const fields = dur as unknown as Record<string, number>;
  for (const [field, unit] of REL_ORDER) {
    const v = fields[field] ?? 0;
    if (v !== 0) return rtf.format(v, unit);
  }
  return rtf.format(0, "second");
}

function nowLike<T extends TemporalPoint>(point: T): T {
  const Now = getTemporal().Now;
  switch (kindOf(point)) {
    case "date":
      return Now.plainDateISO() as unknown as T;
    case "datetime":
      return Now.plainDateTimeISO() as unknown as T;
    case "zoneddatetime":
      return Now.zonedDateTimeISO((point as unknown as Temporal.ZonedDateTime).timeZoneId) as unknown as T;
    case "time":
      return Now.plainTimeISO() as unknown as T;
    case "instant":
      return Now.instant() as unknown as T;
    default:
      throw new TypeError("temporals: fromNow() is not defined for PlainYearMonth");
  }
}

/** Format `point` relative to now ("in 2 hours", "5 days ago"). */
export function fromNow<T extends TemporalPoint>(point: T, opts?: RelativeOptions): string {
  return formatRelative(nowLike(point), point, opts);
}

const DURATION_UNITS: Record<string, string> = {
  y: "years",
  mo: "months",
  w: "weeks",
  d: "days",
  h: "hours",
  m: "minutes",
  s: "seconds",
  ms: "milliseconds",
};

/**
 * Parse a shorthand duration string (`"1h30m"`, `"2d"`, `"1h 30m 15s"`) into a
 * `Temporal.Duration`. Units: `y mo w d h m s ms` (`m` = minutes, `mo` = months).
 */
export function parseDuration(text: string): Temporal.Duration {
  const fields: Record<string, number> = {};
  const re = /(-?\d+(?:\.\d+)?)\s*(mo|ms|[ywdhms])/gi;
  let match: RegExpExecArray | null;
  let matched = false;
  while ((match = re.exec(text)) !== null) {
    matched = true;
    const unit = DURATION_UNITS[match[2]!.toLowerCase()];
    if (!unit) throw new RangeError(`temporals: unknown duration unit "${match[2]}"`);
    fields[unit] = (fields[unit] ?? 0) + Number(match[1]);
  }
  if (!matched) throw new RangeError(`temporals: could not parse duration "${text}"`);
  return getTemporal().Duration.from(fields);
}
