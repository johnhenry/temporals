import type { Temporal } from "temporal-polyfill";
import type { DurationLike, Weekday } from "./types.js";
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

/**
 * Weekend-observance rule for a holiday landing on a weekend.
 * `"us"` (a.k.a. `true`): Sat→Fri, Sun→Mon. `"uk"`: Sat & Sun → next Monday.
 */
export type Observed = boolean | "us" | "uk";

function applyObserved(date: PlainDate, observed: Observed): PlainDate {
  if (!observed) return date;
  const style = observed === "uk" ? "uk" : "us";
  if (date.dayOfWeek === 6) return style === "uk" ? date.add({ days: 2 }) : date.subtract({ days: 1 });
  if (date.dayOfWeek === 7) return date.add({ days: 1 }); // Sun → Mon (both styles)
  return date;
}

/** A rule that yields a holiday's date in a given year, or null if it doesn't occur. */
export type HolidayRule = (year: number) => Temporal.PlainDate | null;

/** A holiday on a fixed month/day (e.g. Jan 1), optionally shifted off weekends. */
export function fixedHoliday(month: number, day: number, opts: { observed?: Observed } = {}): HolidayRule {
  return (year) => {
    const d = pd().from({ year, month, day }, { overflow: "reject" });
    return applyObserved(d, opts.observed ?? false);
  };
}

/**
 * A holiday computed from Western (Gregorian) Easter Sunday plus an offset in
 * days (e.g. `-2` for Good Friday, `+1` for Easter Monday).
 */
export function easterHoliday(offsetDays = 0, opts: { observed?: Observed } = {}): HolidayRule {
  return (year) => {
    // Anonymous Gregorian computus.
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = pd().from({ year, month, day }).add({ days: offsetDays });
    return applyObserved(easter, opts.observed ?? false);
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
  opts: { observed?: Observed } = {},
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

  /** Build a holiday set from rules. */
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

/** The 11 US federal holidays (weekend-observed), ready to drop into a calendar. */
export function usFederalHolidays(): Holidays {
  return Holidays.of(
    fixedHoliday(1, 1, { observed: true }), // New Year's Day
    nthWeekdayHoliday(1, "MO", 3), // Martin Luther King Jr. Day
    nthWeekdayHoliday(2, "MO", 3), // Washington's Birthday
    nthWeekdayHoliday(5, "MO", -1), // Memorial Day
    fixedHoliday(6, 19, { observed: true }), // Juneteenth
    fixedHoliday(7, 4, { observed: true }), // Independence Day
    nthWeekdayHoliday(9, "MO", 1), // Labor Day
    nthWeekdayHoliday(10, "MO", 2), // Columbus Day
    fixedHoliday(11, 11, { observed: true }), // Veterans Day
    nthWeekdayHoliday(11, "TH", 4), // Thanksgiving
    fixedHoliday(12, 25, { observed: true }), // Christmas
  );
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

  /** Whether `date` is a working day (not a weekend, not a holiday). */
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

  /**
   * The nth business day of a month (1-based; negative counts from the end,
   * `-1` = last business day), or `null` if the month has fewer. Handy for
   * payroll / settlement rules.
   */
  nthBusinessDay(year: number, month: number, n: number): PlainDate | null {
    const first = getTemporal().PlainDate.from({ year, month, day: 1 });
    const days: PlainDate[] = [];
    for (let day = 1; day <= first.daysInMonth; day++) {
      const d = first.with({ day });
      if (this.isBusinessDay(d)) days.push(d);
    }
    const idx = n > 0 ? n - 1 : days.length + n;
    return days[idx] ?? null;
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
    // The window is attributed to its *start* day's business-day status.
    if (this.calendar && !this.calendar.isBusinessDay(date)) return [];
    const T = getTemporal();
    return this.windows.map(([open, close]) => {
      const openT = T.PlainTime.from(open);
      const closeT = T.PlainTime.from(close);
      const crosses = T.PlainTime.compare(closeT, openT) <= 0; // e.g. 22:00–06:00
      const s = date.toZonedDateTime({ timeZone, plainTime: openT });
      const e = (crosses ? date.add({ days: 1 }) : date).toZonedDateTime({ timeZone, plainTime: closeT });
      return new Interval<ZDT>(s, e);
    });
  }

  /** Working intervals clipped to `[start, end)`, in `start`'s time zone. */
  intervalsBetween(start: ZDT, end: ZDT): IntervalSet<ZDT> {
    const tz = start.timeZoneId;
    const endDate = end.toPlainDate();
    const all: Interval<ZDT>[] = [];
    // Start one day early so a window that began the previous day (overnight
    // shift) and bleeds into [start, end) is captured; clipping trims it.
    for (let d = start.toPlainDate().subtract({ days: 1 }); cmp(d, endDate) <= 0; d = d.add({ days: 1 })) {
      all.push(...this.dayWindows(d, tz));
    }
    return IntervalSet.from(all).intersection(IntervalSet.from([new Interval<ZDT>(start, end)]));
  }

  /** Whether an instant falls within working hours (and a business day). */
  isOpen(instant: ZDT): boolean {
    const tz = instant.timeZoneId;
    const d = instant.toPlainDate();
    // Check the previous day too, for overnight windows.
    const wins = [...this.dayWindows(d.subtract({ days: 1 }), tz), ...this.dayWindows(d, tz)];
    return wins.some((iv) => iv.contains(instant));
  }

  /** The next instant that is open — `instant` itself if already open — or undefined within a year. */
  nextOpen(instant: ZDT): ZDT | undefined {
    return this.intervalsBetween(instant, instant.add({ days: 366 })).intervals[0]?.start;
  }
}

/** Elapsed working time in `[start, end)` under the given working hours. */
export function businessDuration(start: ZDT, end: ZDT, hours: WorkingHours): Temporal.Duration {
  return hours.intervalsBetween(start, end).totalDuration();
}

/** A schedulable participant: their working hours and (optional) busy blocks. */
export interface Participant {
  /** The participant's working hours (evaluated in their own time zone). */
  hours: WorkingHours;
  /** Already-booked intervals to treat as unavailable. */
  busy?: IntervalSet<ZDT>;
}

/**
 * Candidate meeting windows within `within` during which **every** participant
 * is both working and free, and which are at least `duration` long — earliest
 * first. Timezones compose automatically (each participant's hours are in their
 * own zone; comparison is by instant). This is the availability substrate;
 * ranking by preference/fairness is left to the caller.
 */
export function meetingSlots(opts: {
  participants: Participant[];
  within: Interval<ZDT>;
  duration: DurationLike;
  limit?: number;
}): Interval<ZDT>[] {
  const { participants, within, duration, limit = Infinity } = opts;
  if (participants.length === 0) return [];

  let common: IntervalSet<ZDT> | undefined;
  for (const p of participants) {
    const free = p.hours
      .intervalsBetween(within.start, within.end)
      .difference(p.busy ?? IntervalSet.empty<ZDT>());
    common = common ? common.intersection(free) : free;
  }
  if (!common) return [];

  const neededMs = within.start.add(duration).epochMilliseconds - within.start.epochMilliseconds;
  const out: Interval<ZDT>[] = [];
  for (const iv of common) {
    if (iv.end.epochMilliseconds - iv.start.epochMilliseconds >= neededMs) {
      out.push(iv);
      if (out.length >= limit) break;
    }
  }
  return out;
}
