import type { TemporalPoint, Weekday } from "./types.js";
import { add, kindOf, weekdayNumber } from "./internal.js";

/**
 * Calendar rounding and bucketing: `startOf` / `endOf` / `truncate` to a unit,
 * plus quarter and fiscal-period helpers. `endOf` is the **exclusive** upper
 * bound (the start of the next unit), consistent with the library's half-open
 * `[start, end)` convention.
 */

export type CalendarUnit =
  | "year"
  | "quarter"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second";

const ZERO_TIME = { hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 };
const ZERO_SUBSECOND = { millisecond: 0, microsecond: 0, nanosecond: 0 };

interface AnyPoint {
  month: number;
  day: number;
  dayOfWeek: number;
  with(fields: object, opts?: object): AnyPoint;
  withPlainDate?(d: unknown): AnyPoint;
  toPlainDate?(): { with(f: object): unknown };
  startOfDay?(): AnyPoint;
  subtract(d: object): AnyPoint;
}

function hasTime(k: ReturnType<typeof kindOf>): boolean {
  return k === "datetime" || k === "zoneddatetime" || k === "time";
}

/** Start of the calendar/clock unit containing `point`. */
export function startOf<T extends TemporalPoint>(
  point: T,
  unit: CalendarUnit,
  opts: { weekStart?: Weekday } = {},
): T {
  const k = kindOf(point);
  const p = point as unknown as AnyPoint;
  const zoned = k === "zoneddatetime";

  // Date-level units, applied to the calendar date then floored to day start.
  const toDayStart = (adjusted: AnyPoint): T => {
    if (zoned) return (adjusted.startOfDay!() as unknown) as T;
    if (hasTime(k)) return (adjusted.with(ZERO_TIME) as unknown) as T;
    return adjusted as unknown as T; // PlainDate / PlainYearMonth
  };

  switch (unit) {
    case "year":
      return toDayStart(p.with({ month: 1, day: 1 }));
    case "quarter": {
      const q = Math.floor((p.month - 1) / 3);
      return toDayStart(p.with({ month: q * 3 + 1, day: 1 }));
    }
    case "month":
      return toDayStart(p.with({ day: 1 }));
    case "week": {
      if (k === "time" || k === "yearmonth") {
        throw new TypeError(`temporals: startOf("week") is not defined for ${k}`);
      }
      const wkst = weekdayNumber(opts.weekStart ?? "MO");
      const offset = (p.dayOfWeek - wkst + 7) % 7;
      return toDayStart(offset === 0 ? p : p.subtract({ days: offset }));
    }
    case "day":
      return toDayStart(p);
    case "hour":
      return hasTime(k) ? ((p.with({ minute: 0, second: 0, ...ZERO_SUBSECOND }) as unknown) as T) : point;
    case "minute":
      return hasTime(k) ? ((p.with({ second: 0, ...ZERO_SUBSECOND }) as unknown) as T) : point;
    case "second":
      return hasTime(k) ? ((p.with({ ...ZERO_SUBSECOND }) as unknown) as T) : point;
    default:
      throw new RangeError(`temporals: unknown calendar unit "${unit}"`);
  }
}

/** Alias of {@link startOf}. */
export const truncate = startOf;

const UNIT_STEP: Record<CalendarUnit, object> = {
  year: { years: 1 },
  quarter: { months: 3 },
  month: { months: 1 },
  week: { weeks: 1 },
  day: { days: 1 },
  hour: { hours: 1 },
  minute: { minutes: 1 },
  second: { seconds: 1 },
};

/**
 * Exclusive end of the unit containing `point` — i.e. the start of the next
 * unit. Pairs with half-open intervals: `[startOf(p,u), endOf(p,u))`.
 */
export function endOf<T extends TemporalPoint>(
  point: T,
  unit: CalendarUnit,
  opts: { weekStart?: Weekday } = {},
): T {
  return add(startOf(point, unit, opts), UNIT_STEP[unit]);
}

/** Calendar quarter (1–4) of a date-bearing point. */
export function quarterOf(point: TemporalPoint): number {
  const m = (point as unknown as { month: number }).month;
  return Math.floor((m - 1) / 3) + 1;
}

/**
 * Fiscal quarter (1–4) for a fiscal year that starts in `startMonth` (1–12,
 * default 1 = calendar year). e.g. an October start makes Oct–Dec Q1.
 */
export function fiscalQuarterOf(point: TemporalPoint, startMonth = 1): number {
  const m = (point as unknown as { month: number }).month;
  const shifted = ((m - startMonth + 12) % 12) + 1;
  return Math.floor((shifted - 1) / 3) + 1;
}

/**
 * Fiscal year label for a fiscal year starting in `startMonth`. Months before
 * the start belong to the fiscal year named for the calendar year they end in.
 */
export function fiscalYearOf(point: TemporalPoint, startMonth = 1): number {
  const p = point as unknown as { month: number; year: number };
  if (startMonth === 1) return p.year;
  return p.month >= startMonth ? p.year + 1 : p.year;
}
