import type { Temporal } from "temporal-polyfill";
import type { DurationLike, Overflow, TemporalPoint, Weekday } from "./types.js";

/**
 * Operations on Temporal points are derived from the *values themselves*
 * (their constructor, static `compare`, and instance methods) rather than from
 * a global `Temporal` namespace. This keeps the engines agnostic to which
 * Temporal implementation produced the inputs (native or polyfill) and avoids
 * any hard dependency on `globalThis.Temporal` in the hot paths.
 */

export type Kind =
  | "date"
  | "datetime"
  | "zoneddatetime"
  | "yearmonth"
  | "time"
  | "instant";

/** Detect the Temporal kind from a value's constructor name. */
export function kindOf(p: unknown): Kind {
  const name = (p as { constructor?: { name?: string } })?.constructor?.name;
  switch (name) {
    case "PlainDate":
      return "date";
    case "PlainDateTime":
      return "datetime";
    case "ZonedDateTime":
      return "zoneddatetime";
    case "PlainYearMonth":
      return "yearmonth";
    case "PlainTime":
      return "time";
    case "Instant":
      return "instant";
    default:
      throw new TypeError(
        `temporal-seq: expected a Temporal point (PlainDate, PlainDateTime, ZonedDateTime, PlainYearMonth, PlainTime, Instant), got ${
          name ?? typeof p
        }`,
      );
  }
}

/** True for kinds that carry a calendar date (and therefore weekday/month rules). */
export function isDateBearing(k: Kind): boolean {
  return k === "date" || k === "datetime" || k === "zoneddatetime";
}

/** Kinds that accept an `{ overflow }` option in `.add()`. */
function acceptsOverflow(k: Kind): boolean {
  return k === "date" || k === "datetime" || k === "zoneddatetime" || k === "yearmonth";
}

/** Options accepted by Temporal's `until`/`since` difference methods. */
export type DiffOptions = Parameters<Temporal.PlainDate["until"]>[1];

/** Compare two like-typed points: negative / 0 / positive. */
export function cmp<T extends TemporalPoint>(a: T, b: T): number {
  // Every supported point type exposes a static `compare` on its constructor.
  const ctor = (a as unknown as { constructor: { compare(x: T, y: T): number } })
    .constructor;
  return ctor.compare(a, b);
}

/** Add a duration to a point, forwarding overflow where the type supports it. */
export function add<T extends TemporalPoint>(
  p: T,
  dur: DurationLike,
  overflow?: Overflow,
): T {
  const anyP = p as unknown as {
    add(d: DurationLike, opts?: { overflow: Overflow }): T;
  };
  if (overflow && acceptsOverflow(kindOf(p))) {
    return anyP.add(dur, { overflow });
  }
  return anyP.add(dur);
}

const DURATION_FIELDS = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
  "microseconds",
  "nanoseconds",
] as const;

/**
 * Scale a duration-like by an integer factor, returning a plain duration object.
 * Used for anchor-relative stepping (`start + step × n`), which avoids the
 * month-end drift that repeated `+ step` would introduce (e.g. Jan 31 → Feb 28
 * → Mar 28 instead of Mar 31).
 */
export function scaleDuration(step: DurationLike, n: number): DurationLike {
  if (n === 1) return step;
  const src = step as unknown as Record<string, number | undefined>;
  const out: Record<string, number> = {};
  let any = false;
  for (const f of DURATION_FIELDS) {
    const v = src[f];
    if (v) {
      out[f] = v * n;
      any = true;
    }
  }
  // All-zero step: reuse the original (a valid zero duration for this type).
  return any ? (out as DurationLike) : step;
}

/** Subtract two like-typed points into a Duration (`a.until(b)`). */
export function until<T extends TemporalPoint>(
  a: T,
  b: T,
  opts?: DiffOptions,
): Temporal.Duration {
  const anyA = a as unknown as {
    until(other: T, o?: DiffOptions): Temporal.Duration;
  };
  return anyA.until(b, opts);
}

/** Stable string key for de-duplication. */
export function key(p: TemporalPoint): string {
  return p.toString();
}

// ---------------------------------------------------------------------------
// Calendar-date helpers (operate on PlainDate, derived from the input value).
// ---------------------------------------------------------------------------

export const WEEKDAY_CODES: readonly Weekday[] = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
];

/** Map a weekday code to Temporal's `dayOfWeek` number (Mon=1 … Sun=7). */
export function weekdayNumber(code: Weekday): number {
  const n = WEEKDAY_CODES.indexOf(code);
  if (n < 0) throw new RangeError(`temporal-seq: invalid weekday "${code}"`);
  return n + 1;
}

/** Map Temporal's `dayOfWeek` number back to a weekday code. */
export function weekdayCode(dayOfWeek: number): Weekday {
  return WEEKDAY_CODES[dayOfWeek - 1]!;
}

export type PlainDate = Temporal.PlainDate;

/** Extract the calendar date of any date-bearing point as a PlainDate. */
export function datePart(p: TemporalPoint): PlainDate {
  const k = kindOf(p);
  if (k === "date") return p as PlainDate;
  if (k === "datetime" || k === "zoneddatetime") {
    return (p as Temporal.PlainDateTime | Temporal.ZonedDateTime).toPlainDate();
  }
  throw new TypeError(
    "temporal-seq: recurrence requires a date-bearing point (PlainDate, PlainDateTime, or ZonedDateTime)",
  );
}

/** Rebuild a value of the original point's type on a different calendar date. */
export function withDate<T extends TemporalPoint>(template: T, date: PlainDate): T {
  const k = kindOf(template);
  if (k === "date") return date as unknown as T;
  if (k === "datetime") {
    const t = (template as Temporal.PlainDateTime).toPlainTime();
    return date.toPlainDateTime(t) as unknown as T;
  }
  if (k === "zoneddatetime") {
    const zdt = template as Temporal.ZonedDateTime;
    return date.toZonedDateTime({
      timeZone: zdt.timeZoneId,
      plainTime: zdt.toPlainTime(),
    }) as unknown as T;
  }
  throw new TypeError("temporal-seq: cannot rebuild a non-date-bearing point onto a date");
}

/** Construct a PlainDate (y, m, d) from a reference PlainDate, clamping invalid days. */
export function makeDate(ref: PlainDate, year: number, month: number, day: number): PlainDate {
  return ref.with({ year, month, day }, { overflow: "constrain" });
}

/** Number of days in (year, month), using a reference PlainDate for the calendar. */
export function daysInMonth(ref: PlainDate, year: number, month: number): number {
  return ref.with({ year, month, day: 1 }, { overflow: "constrain" }).daysInMonth;
}

/** First day-of-month (1-based) whose weekday matches `wd` (1..7), or 0 if none. */
export function firstWeekdayOfMonth(
  ref: PlainDate,
  year: number,
  month: number,
  wd: number,
): number {
  const firstDow = ref.with({ year, month, day: 1 }, { overflow: "constrain" }).dayOfWeek;
  return 1 + ((wd - firstDow + 7) % 7);
}
