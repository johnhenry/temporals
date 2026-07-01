import type {
  Frequency,
  TemporalPoint,
  Weekday,
  WeekdaySpec,
} from "./types.js";
import type { Temporal } from "temporal-polyfill";
import {
  add,
  cmp,
  datePart,
  daysInMonth,
  type DstPolicy,
  firstWeekdayOfMonth,
  isDateBearing,
  key,
  kindOf,
  type PlainDate,
  resolveWallToZoned,
  weekdayNumber,
  withDate,
} from "./internal.js";
import { Seq } from "./seq.js";

/**
 * An iCalendar-style recurrence rule (a pragmatic subset of RFC 5545).
 *
 * Supported: FREQ (yearly/monthly/weekly/daily/hourly/minutely/secondly),
 * INTERVAL, COUNT, UNTIL, BYMONTH, BYWEEKNO (yearly), BYYEARDAY, BYMONTHDAY
 * (incl. negative), BYDAY (incl. nth, e.g. `2TU`/`-1FR`),
 * BYHOUR/BYMINUTE/BYSECOND, BYSETPOS, WKST.
 */
export interface RecurRule<T extends TemporalPoint = TemporalPoint> {
  /** First instance / anchor (DTSTART). Must be date-bearing. */
  start: T;
  freq: Frequency;
  /** Period multiplier; default 1. */
  interval?: number;
  /** Stop after this many instances. */
  count?: number;
  /** Stop at this point, inclusive. */
  until?: T;
  /** Limit to these months (1–12). */
  byMonth?: number[];
  /** ISO week numbers (1–53, or negative from year end). YEARLY only. */
  byWeekNo?: number[];
  /** Days of the year (1–366, or negative from year end). */
  byYearDay?: number[];
  /** Days of month (1–31, or negative from month end). */
  byMonthDay?: number[];
  /** Weekdays, optionally with an ordinal (`"TU"` or `{ weekday: "TU", nth: 2 }`). */
  byWeekday?: WeekdaySpec[];
  byHour?: number[];
  byMinute?: number[];
  bySecond?: number[];
  /** Select the nth occurrence(s) within each period (1-based; negative from end). */
  bySetPos?: number[];
  /** Week start for WEEKLY expansion; default `"MO"`. */
  weekStart?: Weekday;
  /** Extra one-off occurrences to merge in (RFC 5545 RDATE). */
  include?: T[];
  /** Occurrences to remove (RFC 5545 EXDATE), matched by value. */
  exclude?: T[];
  /** DST policy for `ZonedDateTime` starts (gap: fire/skip, overlap: first/second). */
  dstGap?: "fire" | "skip";
  dstOverlap?: "first" | "second";
}

interface NormWeekday {
  wd: number;
  nth?: number;
}

const MAX_EMPTY_PERIODS = 10_000;

function normWeekday(spec: WeekdaySpec): NormWeekday {
  if (typeof spec === "string") return { wd: weekdayNumber(spec) };
  return { wd: weekdayNumber(spec.weekday), nth: spec.nth };
}

function intRange(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function resolveMonthDay(md: number, dim: number): number | null {
  const d = md > 0 ? md : dim + md + 1;
  return d >= 1 && d <= dim ? d : null;
}

function nthWeekdayDay(
  ref: PlainDate,
  year: number,
  month: number,
  wd: number,
  nth: number,
): number | null {
  const dim = daysInMonth(ref, year, month);
  const first = firstWeekdayOfMonth(ref, year, month, wd); // 1..7
  if (nth > 0) {
    const day = first + (nth - 1) * 7;
    return day <= dim ? day : null;
  }
  // negative: count from the last occurrence
  const last = first + Math.floor((dim - first) / 7) * 7;
  const day = last + (nth + 1) * 7;
  return day >= 1 ? day : null;
}

function allWeekdayDays(ref: PlainDate, year: number, month: number, wd: number): number[] {
  const dim = daysInMonth(ref, year, month);
  const days: number[] = [];
  for (let d = firstWeekdayOfMonth(ref, year, month, wd); d <= dim; d += 7) days.push(d);
  return days;
}

function daysInYear(ref: PlainDate, year: number): number {
  return ref.with({ year, month: 1, day: 1 }, { overflow: "constrain" }).daysInYear;
}

/** Resolve a 1-based (or negative-from-end) day-of-year to a PlainDate, or null. */
function resolveYearDay(ref: PlainDate, year: number, yd: number): PlainDate | null {
  const total = daysInYear(ref, year);
  const ord = yd > 0 ? yd : total + yd + 1;
  if (ord < 1 || ord > total) return null;
  return ref.with({ year, month: 1, day: 1 }, { overflow: "constrain" }).add({ days: ord - 1 });
}

/** Number of ISO weeks (52 or 53) in an ISO week-year. Dec 28 is always in the last week. */
function isoWeeksInYear(ref: PlainDate, year: number): number {
  return ref.with({ year, month: 12, day: 28 }, { overflow: "constrain" }).weekOfYear ?? 52;
}

/** Days-of-month (sorted, unique) selected within a single month. */
function expandMonth(
  ref: PlainDate,
  year: number,
  month: number,
  byMonthDay: number[] | undefined,
  byWeekday: NormWeekday[] | undefined,
  fallbackDay: number | undefined,
): number[] {
  const dim = daysInMonth(ref, year, month);
  const hasMD = byMonthDay && byMonthDay.length > 0;
  const hasWD = byWeekday && byWeekday.length > 0;

  let mdDays: number[] | undefined;
  if (hasMD) {
    mdDays = [];
    for (const md of byMonthDay!) {
      const d = resolveMonthDay(md, dim);
      if (d !== null) mdDays.push(d);
    }
  }

  let wdDays: number[] | undefined;
  if (hasWD) {
    const set = new Set<number>();
    for (const { wd, nth } of byWeekday!) {
      if (nth !== undefined) {
        const day = nthWeekdayDay(ref, year, month, wd, nth);
        if (day !== null) set.add(day);
      } else {
        for (const day of allWeekdayDays(ref, year, month, wd)) set.add(day);
      }
    }
    wdDays = [...set];
  }

  let days: number[];
  if (mdDays && wdDays) {
    const wdSet = new Set(wdDays);
    days = mdDays.filter((d) => wdSet.has(d));
  } else if (mdDays) {
    days = mdDays;
  } else if (wdDays) {
    days = wdDays;
  } else if (fallbackDay !== undefined) {
    days = fallbackDay <= dim ? [fallbackDay] : [];
  } else {
    days = [];
  }

  return [...new Set(days)].sort((a, b) => a - b);
}

/** PlainDate candidates for one period, given the frequency. */
function periodCandidates(
  rule: RecurRule,
  ref: PlainDate,
  byWeekday: NormWeekday[] | undefined,
  state: PeriodState,
): PlainDate[] {
  const { byMonth, byMonthDay } = rule;
  const monthOk = (m: number) => !byMonth || byMonth.includes(m);

  switch (rule.freq) {
    case "daily": {
      const d = state.date!;
      if (!monthOk(d.month)) return [];
      if (byMonthDay && byMonthDay.length > 0) {
        const ok = byMonthDay.some(
          (md) => resolveMonthDay(md, d.daysInMonth) === d.day,
        );
        if (!ok) return [];
      }
      if (rule.byYearDay && rule.byYearDay.length > 0) {
        const total = d.daysInYear;
        const ok = rule.byYearDay.some(
          (yd) => (yd > 0 ? yd : total + yd + 1) === d.dayOfYear,
        );
        if (!ok) return [];
      }
      if (byWeekday && byWeekday.length > 0) {
        if (!byWeekday.some((w) => w.wd === d.dayOfWeek)) return [];
      }
      return [d];
    }
    case "weekly": {
      const wkst = weekdayNumber(rule.weekStart ?? "MO");
      const wdNums =
        byWeekday && byWeekday.length > 0
          ? byWeekday.map((w) => w.wd)
          : [ref.dayOfWeek];
      const wantSet = new Set(wdNums);
      const out: PlainDate[] = [];
      let day = state.weekStartDate!;
      for (let i = 0; i < 7; i++) {
        if (wantSet.has(day.dayOfWeek) && monthOk(day.month)) out.push(day);
        day = day.add({ days: 1 });
      }
      void wkst;
      return out;
    }
    case "monthly": {
      const anchor = state.anchor!;
      const month = anchor.month;
      if (!monthOk(month)) return [];
      const days = expandMonth(anchor, anchor.year, month, byMonthDay, byWeekday, ref.day);
      return days.map((d) => anchor.with({ day: d }));
    }
    case "yearly": {
      const anchor = state.anchor!;
      const year = anchor.year;
      const hasMD = byMonthDay && byMonthDay.length > 0;
      const hasWD = byWeekday && byWeekday.length > 0;
      const hasYD = rule.byYearDay && rule.byYearDay.length > 0;
      const hasWN = rule.byWeekNo && rule.byWeekNo.length > 0;

      // BYWEEKNO expands to whole ISO weeks (filtered by BYDAY / BYMONTH).
      if (hasWN) {
        const weeks = new Set(
          rule.byWeekNo!.map((w) => (w > 0 ? w : isoWeeksInYear(ref, year) + w + 1)),
        );
        const wdNums = new Set(hasWD ? byWeekday!.map((w) => w.wd) : [ref.dayOfWeek]);
        const out: PlainDate[] = [];
        // Scan the ISO week-year with a ±1 week margin for boundary weeks.
        let d = ref.with({ year, month: 1, day: 1 }, { overflow: "constrain" }).subtract({ days: 7 });
        const stop = ref.with({ year, month: 12, day: 31 }, { overflow: "constrain" }).add({ days: 7 });
        for (; cmp(d, stop) <= 0; d = d.add({ days: 1 })) {
          if (
            d.yearOfWeek === year &&
            weeks.has(d.weekOfYear ?? -1) &&
            wdNums.has(d.dayOfWeek) &&
            monthOk(d.month)
          ) {
            out.push(d);
          }
        }
        return out;
      }

      // BYYEARDAY expands to specific days of the year (filtered by BYMONTH / BYDAY).
      if (hasYD && !hasMD) {
        const wdNums = hasWD ? new Set(byWeekday!.map((w) => w.wd)) : null;
        const out: PlainDate[] = [];
        for (const yd of rule.byYearDay!) {
          const d = resolveYearDay(ref, year, yd);
          if (!d) continue;
          if (!monthOk(d.month)) continue;
          if (wdNums && !wdNums.has(d.dayOfWeek)) continue;
          out.push(d);
        }
        const seen = new Set<string>();
        return out
          .filter((d) => {
            const kk = key(d);
            if (seen.has(kk)) return false;
            seen.add(kk);
            return true;
          })
          .sort((a, b) => cmp(a, b));
      }

      // Calendar-aware month span (Hebrew leap years have 13 months, etc.).
      const monthsInYear = anchor.monthsInYear;
      const months = byMonth ?? (hasMD || hasWD ? intRange(1, monthsInYear) : [ref.month]);
      const out: PlainDate[] = [];
      for (const month of months) {
        if (month < 1 || month > monthsInYear) continue;
        const monthAnchor = anchor.with({ month, day: 1 }, { overflow: "constrain" });
        const days = expandMonth(monthAnchor, year, month, byMonthDay, byWeekday, ref.day);
        for (const d of days) out.push(monthAnchor.with({ day: d }));
      }
      return out;
    }
    default:
      throw new RangeError(
        `temporals: recurrence freq "${rule.freq}" is not supported (yearly/monthly/weekly/daily only)`,
      );
  }
}

interface PeriodState {
  date?: PlainDate; // daily
  weekStartDate?: PlainDate; // weekly
  anchor?: PlainDate; // monthly: 1st of the month; yearly: 1st day of the year
}

function startOfWeek(pd: PlainDate, wkst: number): PlainDate {
  const offset = (pd.dayOfWeek - wkst + 7) % 7;
  return pd.subtract({ days: offset });
}

function initState(rule: RecurRule, ref: PlainDate): PeriodState {
  switch (rule.freq) {
    case "daily":
      return { date: ref };
    case "weekly":
      return { weekStartDate: startOfWeek(ref, weekdayNumber(rule.weekStart ?? "MO")) };
    case "monthly":
      return { anchor: ref.with({ day: 1 }) };
    case "yearly":
      return { anchor: ref.with({ month: 1, day: 1 }, { overflow: "constrain" }) };
    default:
      throw new RangeError(`temporals: unsupported freq "${rule.freq}"`);
  }
}

function advanceState(rule: RecurRule, state: PeriodState): PeriodState {
  const interval = rule.interval ?? 1;
  switch (rule.freq) {
    case "daily":
      return { date: state.date!.add({ days: interval }) };
    case "weekly":
      return { weekStartDate: state.weekStartDate!.add({ weeks: interval }) };
    case "monthly":
      // Calendar arithmetic (no year*12 assumption).
      return { anchor: state.anchor!.add({ months: interval }) };
    case "yearly":
      return { anchor: state.anchor!.add({ years: interval }) };
    default:
      throw new RangeError(`temporals: unsupported freq "${rule.freq}"`);
  }
}

/** Expand date candidates into typed values, applying time rules (and DST policy for zoned). */
function applyTimes<T extends TemporalPoint>(template: T, date: PlainDate, rule: RecurRule): T[] {
  const k = kindOf(template);

  // ZonedDateTime: build the wall time, then resolve under the DST policy.
  if (k === "zoneddatetime") {
    const zdt = template as unknown as Temporal.ZonedDateTime;
    const tz = zdt.timeZoneId;
    const baseTime = zdt.toPlainTime();
    const hours = rule.byHour && rule.byHour.length ? rule.byHour : [baseTime.hour];
    const minutes = rule.byMinute && rule.byMinute.length ? rule.byMinute : [baseTime.minute];
    const seconds = rule.bySecond && rule.bySecond.length ? rule.bySecond : [baseTime.second];
    const policy: DstPolicy = { dstGap: rule.dstGap, dstOverlap: rule.dstOverlap };
    const out: T[] = [];
    for (const hour of hours)
      for (const minute of minutes)
        for (const second of seconds) {
          const wall = date.toPlainDateTime(baseTime.with({ hour, minute, second }));
          const resolved = resolveWallToZoned(wall, tz, policy);
          if (resolved) out.push(resolved as unknown as T);
        }
    return out;
  }

  const base = withDate(template, date);
  const hasTime =
    (rule.byHour && rule.byHour.length) ||
    (rule.byMinute && rule.byMinute.length) ||
    (rule.bySecond && rule.bySecond.length);
  if (!hasTime || k === "date") return [base];

  const t = base as unknown as {
    hour: number;
    minute: number;
    second: number;
    with(fields: object): T;
  };
  const hours = rule.byHour && rule.byHour.length ? rule.byHour : [t.hour];
  const minutes = rule.byMinute && rule.byMinute.length ? rule.byMinute : [t.minute];
  const seconds = rule.bySecond && rule.bySecond.length ? rule.bySecond : [t.second];
  const out: T[] = [];
  for (const hour of hours)
    for (const minute of minutes)
      for (const second of seconds) out.push(t.with({ hour, minute, second }));
  return out;
}

function applySetPos<T extends TemporalPoint>(items: T[], setPos: number[] | undefined): T[] {
  if (!setPos || setPos.length === 0) return items;
  const picked: T[] = [];
  for (const pos of setPos) {
    const idx = pos > 0 ? pos - 1 : items.length + pos;
    if (idx >= 0 && idx < items.length) picked.push(items[idx]!);
  }
  return picked;
}

const SUB_DAILY = new Set<Frequency>(["hourly", "minutely", "secondly"]);

function isTimeBearing(k: ReturnType<typeof kindOf>): boolean {
  return k === "datetime" || k === "zoneddatetime" || k === "time";
}

function validate(rule: RecurRule): void {
  const k = kindOf(rule.start);
  if (SUB_DAILY.has(rule.freq)) {
    if (!isTimeBearing(k)) {
      throw new TypeError(
        "temporals: sub-daily recurrence requires a time-bearing start (PlainDateTime, ZonedDateTime, or PlainTime)",
      );
    }
  } else if (!isDateBearing(k)) {
    throw new TypeError(
      "temporals: recur() requires a date-bearing start (PlainDate, PlainDateTime, or ZonedDateTime)",
    );
  }
  if (rule.byWeekNo && rule.freq !== "yearly") {
    throw new RangeError("temporals: BYWEEKNO is only valid with FREQ=YEARLY");
  }
  if (rule.bySetPos && SUB_DAILY.has(rule.freq)) {
    throw new RangeError("temporals: BYSETPOS with sub-daily frequencies is not supported");
  }
  if (rule.interval !== undefined && (!Number.isInteger(rule.interval) || rule.interval < 1)) {
    throw new RangeError("temporals: recur() interval must be a positive integer");
  }
}

const MAX_SUBDAILY_SKIP = 1_000_000;

/** Whether a sub-daily instant passes the BY* filters (all treated as limits). */
function passesSubDaily(p: TemporalPoint, rule: RecurRule, byWeekday: NormWeekday[] | undefined): boolean {
  const k = kindOf(p);
  const anyP = p as unknown as {
    month: number;
    day: number;
    daysInMonth: number;
    dayOfWeek: number;
    dayOfYear: number;
    daysInYear: number;
    hour: number;
    minute: number;
    second: number;
  };
  if (isDateBearing(k)) {
    if (rule.byMonth && !rule.byMonth.includes(anyP.month)) return false;
    if (rule.byMonthDay && !rule.byMonthDay.some((md) => resolveMonthDay(md, anyP.daysInMonth) === anyP.day)) {
      return false;
    }
    if (rule.byYearDay) {
      const total = anyP.daysInYear;
      if (!rule.byYearDay.some((yd) => (yd > 0 ? yd : total + yd + 1) === anyP.dayOfYear)) return false;
    }
    if (byWeekday && byWeekday.length > 0 && !byWeekday.some((w) => w.wd === anyP.dayOfWeek)) {
      return false;
    }
  }
  if (rule.byHour && !rule.byHour.includes(anyP.hour)) return false;
  if (rule.byMinute && !rule.byMinute.includes(anyP.minute)) return false;
  if (rule.bySecond && !rule.bySecond.includes(anyP.second)) return false;
  return true;
}

function* subDailyGen<T extends TemporalPoint>(rule: RecurRule<T>): Generator<T> {
  const start = rule.start;
  const interval = rule.interval ?? 1;
  const unit =
    rule.freq === "hourly"
      ? { hours: interval }
      : rule.freq === "minutely"
        ? { minutes: interval }
        : { seconds: interval };
  const byWeekday = rule.byWeekday?.map(normWeekday);

  let cur = start;
  let skip = 0;
  while (true) {
    if (rule.until !== undefined && cmp(cur, rule.until) > 0) return; // bound the walk
    if (passesSubDaily(cur, rule, byWeekday)) {
      yield cur;
      skip = 0;
    } else if (++skip > MAX_SUBDAILY_SKIP) {
      throw new RangeError(
        "temporals: sub-daily recurrence matched nothing for a very long span (likely an impossible rule)",
      );
    }
    cur = add(cur, unit);
  }
}

/** The raw, ascending stream of rule occurrences at/after `start` (no count/until/exdate). */
function* ruleStreamGen<T extends TemporalPoint>(rule: RecurRule<T>): Generator<T> {
  const start = rule.start;
  const ref = datePart(start);
  const byWeekday = rule.byWeekday?.map(normWeekday);
  let state = initState(rule, ref);
  let emptyStreak = 0;

  while (true) {
    const dates = periodCandidates(rule, ref, byWeekday, state);

    let typed: T[] = [];
    for (const d of dates) typed.push(...applyTimes(start, d, rule));
    typed.sort((a, b) => cmp(a, b));
    const seen = new Set<string>();
    typed = typed.filter((v) => {
      const kk = key(v);
      if (seen.has(kk)) return false;
      seen.add(kk);
      return true;
    });
    typed = applySetPos(typed, rule.bySetPos).sort((a, b) => cmp(a, b));

    let produced = false;
    for (const c of typed) {
      if (cmp(c, start) < 0) continue;
      yield c;
      produced = true;
    }

    if (produced) {
      emptyStreak = 0;
    } else if (++emptyStreak > MAX_EMPTY_PERIODS) {
      throw new RangeError(
        `temporals: recurrence produced no occurrences for ${MAX_EMPTY_PERIODS} consecutive periods (likely an impossible rule)`,
      );
    }
    state = advanceState(rule, state);
  }
}

/**
 * Merge the rule stream with RDATE extras, drop EXDATE matches and duplicates,
 * and apply `until` / `count`.
 */
function* postProcess<T extends TemporalPoint>(base: Iterator<T>, rule: RecurRule<T>): Generator<T> {
  const start = rule.start;
  const exSet = new Set((rule.exclude ?? []).map((d) => key(d)));
  const extras = (rule.include ?? []).filter((d) => cmp(d, start) >= 0).sort((a, b) => cmp(a, b));
  const { until, count } = rule;
  let ei = 0;
  let emitted = 0;
  let lastKey: string | undefined;
  let nr = base.next();

  while (true) {
    const hasRule = !nr.done;
    const hasExtra = ei < extras.length;
    if (!hasRule && !hasExtra) return;

    let v: T;
    let fromRule: boolean;
    if (hasRule && (!hasExtra || cmp(nr.value, extras[ei]!) <= 0)) {
      v = nr.value;
      fromRule = true;
    } else {
      v = extras[ei]!;
      fromRule = false;
    }
    if (until !== undefined && cmp(v, until) > 0) return;
    if (fromRule) nr = base.next();
    else ei++;

    const kk = key(v);
    if (exSet.has(kk) || kk === lastKey) continue; // EXDATE or adjacent duplicate (RDATE == rule)
    lastKey = kk;
    yield v;
    if (count !== undefined && ++emitted >= count) return;
  }
}

/**
 * A lazy sequence of recurrence instances. Unbounded unless `count` or `until`
 * is set — bound infinite rules with `.take(n)`. Supports RDATE (`include`),
 * EXDATE (`exclude`), and an explicit DST policy for zoned starts.
 */
export function recur<T extends TemporalPoint>(rule: RecurRule<T>): Seq<T> {
  validate(rule);
  const source = SUB_DAILY.has(rule.freq)
    ? () => subDailyGen(rule)
    : () => ruleStreamGen<T>(rule);
  return new Seq<T>(() => postProcess(source(), rule));
}

// ---------------------------------------------------------------------------
// RFC 5545 RRULE string interop
// ---------------------------------------------------------------------------

const FREQ_TO_STR: Record<Frequency, string> = {
  yearly: "YEARLY",
  monthly: "MONTHLY",
  weekly: "WEEKLY",
  daily: "DAILY",
  hourly: "HOURLY",
  minutely: "MINUTELY",
  secondly: "SECONDLY",
};
const STR_TO_FREQ: Record<string, Frequency> = {
  YEARLY: "yearly",
  MONTHLY: "monthly",
  WEEKLY: "weekly",
  DAILY: "daily",
  HOURLY: "hourly",
  MINUTELY: "minutely",
  SECONDLY: "secondly",
};

function parseWeekday(token: string): WeekdaySpec {
  const m = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(token.trim());
  if (!m) throw new RangeError(`temporals: invalid BYDAY token "${token}"`);
  const weekday = m[2] as Weekday;
  return m[1] ? { weekday, nth: Number(m[1]) } : weekday;
}

function intList(value: string): number[] {
  return value.split(",").map((s) => Number(s.trim()));
}

/**
 * Parse an RFC 5545 RRULE string plus a DTSTART value into a {@link RecurRule}
 * object (so callers can attach `include`/`exclude`/DST policy before running).
 */
export function ruleFromString<T extends TemporalPoint>(rrule: string, dtstart: T): RecurRule<T> {
  const body = rrule.replace(/^RRULE:/i, "");
  const rule: RecurRule<T> = { start: dtstart, freq: "daily" };
  let freqSeen = false;

  for (const part of body.split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const name = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    switch (name) {
      case "FREQ": {
        const f = STR_TO_FREQ[value.toUpperCase()];
        if (!f) throw new RangeError(`temporals: unsupported FREQ "${value}"`);
        rule.freq = f;
        freqSeen = true;
        break;
      }
      case "INTERVAL":
        rule.interval = Number(value);
        break;
      case "COUNT":
        rule.count = Number(value);
        break;
      case "UNTIL": {
        const ctor = (dtstart as unknown as { constructor: { from(s: string): T } })
          .constructor;
        rule.until = ctor.from(value);
        break;
      }
      case "BYMONTH":
        rule.byMonth = intList(value);
        break;
      case "BYWEEKNO":
        rule.byWeekNo = intList(value);
        break;
      case "BYYEARDAY":
        rule.byYearDay = intList(value);
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = intList(value);
        break;
      case "BYDAY":
        rule.byWeekday = value.split(",").map(parseWeekday);
        break;
      case "BYHOUR":
        rule.byHour = intList(value);
        break;
      case "BYMINUTE":
        rule.byMinute = intList(value);
        break;
      case "BYSECOND":
        rule.bySecond = intList(value);
        break;
      case "BYSETPOS":
        rule.bySetPos = intList(value);
        break;
      case "WKST":
        rule.weekStart = value.toUpperCase() as Weekday;
        break;
      default:
        throw new RangeError(`temporals: unsupported RRULE part "${name}"`);
    }
  }
  if (!freqSeen) throw new RangeError("temporals: RRULE is missing FREQ");
  return rule;
}

/**
 * Build a {@link recur} sequence from an RFC 5545 RRULE string plus a DTSTART
 * value, e.g. `recurFromString("FREQ=MONTHLY;BYDAY=2TU;COUNT=12", start)`.
 */
export function recurFromString<T extends TemporalPoint>(rrule: string, dtstart: T): Seq<T> {
  return recur(ruleFromString(rrule, dtstart));
}

/** Serialise a rule's recurrence parameters back to an RFC 5545 RRULE string. */
export function formatRule(rule: RecurRule): string {
  const parts: string[] = [`FREQ=${FREQ_TO_STR[rule.freq]}`];
  if (rule.interval && rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== undefined) parts.push(`UNTIL=${rule.until.toString()}`);
  if (rule.byMonth) parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  if (rule.byWeekNo) parts.push(`BYWEEKNO=${rule.byWeekNo.join(",")}`);
  if (rule.byYearDay) parts.push(`BYYEARDAY=${rule.byYearDay.join(",")}`);
  if (rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.byWeekday) {
    const tokens = rule.byWeekday.map((w) =>
      typeof w === "string" ? w : `${w.nth ?? ""}${w.weekday}`,
    );
    parts.push(`BYDAY=${tokens.join(",")}`);
  }
  if (rule.byHour) parts.push(`BYHOUR=${rule.byHour.join(",")}`);
  if (rule.byMinute) parts.push(`BYMINUTE=${rule.byMinute.join(",")}`);
  if (rule.bySecond) parts.push(`BYSECOND=${rule.bySecond.join(",")}`);
  if (rule.bySetPos) parts.push(`BYSETPOS=${rule.bySetPos.join(",")}`);
  if (rule.weekStart && rule.weekStart !== "MO") parts.push(`WKST=${rule.weekStart}`);
  return parts.join(";");
}

// Attach `fromString` as a static-like helper on `recur`.
export interface RecurFn {
  <T extends TemporalPoint>(rule: RecurRule<T>): Seq<T>;
  fromString<T extends TemporalPoint>(rrule: string, dtstart: T): Seq<T>;
}
(recur as RecurFn).fromString = recurFromString;
