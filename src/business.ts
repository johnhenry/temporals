import type { Temporal } from "temporal-polyfill";
import type { Weekday } from "./types.js";
import { cmp, weekdayNumber } from "./internal.js";
import { Interval } from "./interval.js";
import { IntervalSet } from "./interval-set.js";
import { range } from "./range.js";
import type { Seq } from "./seq.js";
import { getTemporal } from "./temporal.js";

/**
 * Working-time: business-day calendars (weekends + holidays), holiday rules
 * (which reuse the same nth-weekday logic as RRULE), working-hours windows, and
 * elapsed business-time between two instants.
 *
 * Public entry for the `temporals/business` subpath.
 */

type PlainDate = Temporal.PlainDate;
type ZDT = Temporal.ZonedDateTime;

function pd(): typeof Temporal.PlainDate {
  return getTemporal().PlainDate;
}

function applyObserved(date: PlainDate, observed: boolean): PlainDate {
  if (!observed) return date;
  if (date.dayOfWeek === 6) return date.subtract({ days: 1 }); // Sat → Fri
  if (date.dayOfWeek === 7) return date.add({ days: 1 }); // Sun → Mon
  return date;
}

/** A rule that yields a holiday's date in a given year, or null if it doesn't occur. */
export type HolidayRule = (year: number) => PlainDate | null;

/** A holiday on a fixed month/day (e.g. Jan 1), optionally shifted off weekends. */
export function fixedHoliday(month: number, day: number, opts: { observed?: boolean } = {}): HolidayRule {
  return (year) => {
    const d = pd().from({ year, month, day }, { overflow: "reject" });
    return applyObserved(d, opts.observed ?? false);
  };
}

/**
 * A holiday on the nth weekday of a month (e.g. 4th Thursday of November;
 * `nth: -1` for the last). Same semantics as RRULE `byWeekday` nth.
 */
export function nthWeekdayHoliday(
  month: number,
  weekday: Weekday,
  nth: number,
  opts: { observed?: boolean } = {},
): HolidayRule {
  const wd = weekdayNumber(weekday);
  return (year) => {
    const first = pd().from({ year, month, day: 1 });
    const dim = first.daysInMonth;
    const firstOfWeekday = 1 + ((wd - first.dayOfWeek + 7) % 7);
    let day: number;
    if (nth > 0) {
      day = firstOfWeekday + (nth - 1) * 7;
      if (day > dim) return null;
    } else {
      const last = firstOfWeekday + Math.floor((dim - firstOfWeekday) / 7) * 7;
      day = last + (nth + 1) * 7;
      if (day < 1) return null;
    }
    return applyObserved(first.with({ day }), opts.observed ?? false);
  };
}

/** A set of holiday rules with a fast per-date lookup. */
export class Holidays {
  private readonly rules: HolidayRule[];
  private readonly cache = new Map<number, Set<string>>();

  constructor(rules: HolidayRule[]) {
    this.rules = rules;
  }

  static of(...rules: HolidayRule[]): Holidays {
    return new Holidays(rules);
  }

  private yearSet(year: number): Set<string> {
    let set = this.cache.get(year);
    if (!set) {
      set = new Set(
        this.rules.map((r) => r(year)).filter((d): d is PlainDate => d !== null).map((d) => d.toString()),
      );
      this.cache.set(year, set);
    }
    return set;
  }

  /** Whether the given calendar date is a holiday. */
  has(date: PlainDate): boolean {
    return this.yearSet(date.year).has(date.toString());
  }

  /** All holiday dates in a year, sorted. */
  inYear(year: number): PlainDate[] {
    return [...this.yearSet(year)].map((s) => pd().from(s)).sort((a, b) => cmp(a, b));
  }
}

const SAFETY = 4000; // ~10y — guards against a pathological all-non-business config

/** A business-day calendar: weekends plus optional holidays. */
export class BusinessCalendar {
  private readonly weekend: Set<number>;
  private readonly holidays?: Holidays;

  constructor(opts: { weekend?: Weekday[]; holidays?: Holidays } = {}) {
    const wk = opts.weekend ?? (["SA", "SU"] as Weekday[]);
    this.weekend = new Set(wk.map(weekdayNumber));
    this.holidays = opts.holidays;
  }

  private toDate(date: PlainDate | ZDT | Temporal.PlainDateTime): PlainDate {
    const anyD = date as unknown as { toPlainDate?: () => PlainDate };
    return anyD.toPlainDate ? anyD.toPlainDate() : (date as PlainDate);
  }

  isBusinessDay(date: PlainDate | ZDT | Temporal.PlainDateTime): boolean {
    const d = this.toDate(date);
    if (this.weekend.has(d.dayOfWeek)) return false;
    return !this.holidays?.has(d);
  }

  /** The next business day strictly after `date`. */
  nextBusinessDay(date: PlainDate): PlainDate {
    let d = date.add({ days: 1 });
    for (let i = 0; i < SAFETY; i++, d = d.add({ days: 1 })) if (this.isBusinessDay(d)) return d;
    throw new RangeError("temporals: no business day found (check weekend/holiday config)");
  }

  /** The previous business day strictly before `date`. */
  previousBusinessDay(date: PlainDate): PlainDate {
    let d = date.subtract({ days: 1 });
    for (let i = 0; i < SAFETY; i++, d = d.subtract({ days: 1 })) if (this.isBusinessDay(d)) return d;
    throw new RangeError("temporals: no business day found (check weekend/holiday config)");
  }

  /** Move `n` business days from `date` (negative goes backward). */
  addBusinessDays(date: PlainDate, n: number): PlainDate {
    let d = date;
    const step = n >= 0 ? 1 : -1;
    for (let remaining = Math.abs(n); remaining > 0; remaining--) {
      d = step > 0 ? this.nextBusinessDay(d) : this.previousBusinessDay(d);
    }
    return d;
  }

  /** Count of business days in `[start, end)`. */
  businessDaysBetween(start: PlainDate, end: PlainDate): number {
    let count = 0;
    for (let d = start; cmp(d, end) < 0; d = d.add({ days: 1 })) if (this.isBusinessDay(d)) count++;
    return count;
  }

  /** A lazy sequence of business days in `[start, end)` (or unbounded from `start`). */
  businessDays(opts: { start: PlainDate; end?: PlainDate }): Seq<PlainDate> {
    return range({ start: opts.start, end: opts.end, step: { days: 1 } }).filter((d) =>
      this.isBusinessDay(d),
    );
  }
}

/** A working-hours window as `"HH:MM"` open/close local times. */
export type Window = [open: string, close: string];

/** Daily working-hours windows, evaluated in the zone of the instants you pass. */
export class WorkingHours {
  private readonly windows: Window[];
  private readonly calendar?: BusinessCalendar;

  constructor(opts: { windows?: Window[]; calendar?: BusinessCalendar } = {}) {
    this.windows = (opts.windows ?? [["09:00", "17:00"]]).slice().sort((a, b) => a[0].localeCompare(b[0]));
    this.calendar = opts.calendar;
  }

  private dayWindows(date: PlainDate, timeZone: string): Interval<ZDT>[] {
    if (this.calendar && !this.calendar.isBusinessDay(date)) return [];
    const T = getTemporal();
    return this.windows.map(([open, close]) => {
      const s = date.toZonedDateTime({ timeZone, plainTime: T.PlainTime.from(open) });
      const e = date.toZonedDateTime({ timeZone, plainTime: T.PlainTime.from(close) });
      return new Interval<ZDT>(s, e);
    });
  }

  /** Working intervals clipped to `[start, end)`, in `start`'s time zone. */
  intervalsBetween(start: ZDT, end: ZDT): IntervalSet<ZDT> {
    const tz = start.timeZoneId;
    const endDate = end.toPlainDate();
    const all: Interval<ZDT>[] = [];
    for (let d = start.toPlainDate(); cmp(d, endDate) <= 0; d = d.add({ days: 1 })) {
      all.push(...this.dayWindows(d, tz));
    }
    return IntervalSet.from(all).intersection(IntervalSet.from([new Interval<ZDT>(start, end)]));
  }

  /** Whether an instant falls within working hours (and a business day). */
  isOpen(instant: ZDT): boolean {
    return this.dayWindows(instant.toPlainDate(), instant.timeZoneId).some((iv) => iv.contains(instant));
  }

  /** The next instant that is open — `instant` itself if already open — or undefined. */
  nextOpen(instant: ZDT): ZDT | undefined {
    let ref = instant;
    let d = instant.toPlainDate();
    for (let i = 0; i < SAFETY; i++, d = d.add({ days: 1 }), ref = d.toZonedDateTime({ timeZone: instant.timeZoneId })) {
      for (const iv of this.dayWindows(d, instant.timeZoneId)) {
        if (cmp(ref, iv.end) >= 0) continue;
        return cmp(ref, iv.start) <= 0 ? iv.start : ref;
      }
    }
    return undefined;
  }
}

/** Elapsed working time in `[start, end)` under the given working hours. */
export function businessDuration(start: ZDT, end: ZDT, hours: WorkingHours): Temporal.Duration {
  return hours.intervalsBetween(start, end).totalDuration();
}
