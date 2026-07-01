import type {
  Frequency,
  TemporalPoint,
  Weekday,
  WeekdaySpec,
} from "./types.js";
import {
  add,
  cmp,
  datePart,
  daysInMonth,
  firstWeekdayOfMonth,
  isDateBearing,
  key,
  kindOf,
  makeDate,
  type PlainDate,
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

function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
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
      const { year, month } = state;
      if (!monthOk(month!)) return [];
      const days = expandMonth(ref, year!, month!, byMonthDay, byWeekday, ref.day);
      return days.map((d) => makeDate(ref, year!, month!, d));
    }
    case "yearly": {
      const year = state.year!;
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

      const months = byMonth ?? (hasMD || hasWD ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [ref.month]);
      const out: PlainDate[] = [];
      for (const month of months) {
        const days = expandMonth(ref, year, month, byMonthDay, byWeekday, ref.day);
        for (const d of days) out.push(makeDate(ref, year, month, d));
      }
      return out;
    }
    default:
      throw new RangeError(
        `temporal-seq: recurrence freq "${rule.freq}" is not supported (yearly/monthly/weekly/daily only)`,
      );
  }
}

interface PeriodState {
  date?: PlainDate; // daily
  weekStartDate?: PlainDate; // weekly
  year?: number; // monthly/yearly
  month?: number; // monthly
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
      return { year: ref.year, month: ref.month };
    case "yearly":
      return { year: ref.year };
    default:
      throw new RangeError(`temporal-seq: unsupported freq "${rule.freq}"`);
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
      return addMonths(state.year!, state.month!, interval);
    case "yearly":
      return { year: state.year! + interval };
    default:
      throw new RangeError(`temporal-seq: unsupported freq "${rule.freq}"`);
  }
}

/** Expand date candidates into typed values, applying time rules. */
function applyTimes<T extends TemporalPoint>(template: T, date: PlainDate, rule: RecurRule): T[] {
  const base = withDate(template, date);
  const k = kindOf(template);
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
        "temporal-seq: sub-daily recurrence requires a time-bearing start (PlainDateTime, ZonedDateTime, or PlainTime)",
      );
    }
  } else if (!isDateBearing(k)) {
    throw new TypeError(
      "temporal-seq: recur() requires a date-bearing start (PlainDate, PlainDateTime, or ZonedDateTime)",
    );
  }
  if (rule.byWeekNo && rule.freq !== "yearly") {
    throw new RangeError("temporal-seq: BYWEEKNO is only valid with FREQ=YEARLY");
  }
  if (rule.bySetPos && SUB_DAILY.has(rule.freq)) {
    throw new RangeError("temporal-seq: BYSETPOS with sub-daily frequencies is not supported");
  }
  if (rule.interval !== undefined && (!Number.isInteger(rule.interval) || rule.interval < 1)) {
    throw new RangeError("temporal-seq: recur() interval must be a positive integer");
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
  let emitted = 0;
  let skip = 0;
  while (true) {
    if (rule.until !== undefined && cmp(cur, rule.until) > 0) return;
    if (passesSubDaily(cur, rule, byWeekday)) {
      yield cur;
      emitted++;
      skip = 0;
      if (rule.count !== undefined && emitted >= rule.count) return;
    } else if (++skip > MAX_SUBDAILY_SKIP) {
      return;
    }
    cur = add(cur, unit);
  }
}

/**
 * A lazy sequence of recurrence instances. Unbounded unless `count` or `until`
 * is set — bound infinite rules with `.take(n)`.
 */
export function recur<T extends TemporalPoint>(rule: RecurRule<T>): Seq<T> {
  validate(rule);
  if (SUB_DAILY.has(rule.freq)) {
    return new Seq<T>(() => subDailyGen(rule));
  }
  return new Seq<T>(function* () {
    const start = rule.start;
    const ref = datePart(start);
    const byWeekday = rule.byWeekday?.map(normWeekday);

    let state = initState(rule, ref);
    let emitted = 0;
    let emptyStreak = 0;

    while (true) {
      const dates = periodCandidates(rule, ref, byWeekday, state);

      // Build the full typed candidate set for the period, then setpos.
      let typed: T[] = [];
      for (const d of dates) typed.push(...applyTimes(start, d, rule));
      typed.sort((a, b) => cmp(a, b));
      // de-duplicate
      const seen = new Set<string>();
      typed = typed.filter((v) => {
        const kk = key(v);
        if (seen.has(kk)) return false;
        seen.add(kk);
        return true;
      });
      typed = applySetPos(typed, rule.bySetPos).sort((a, b) => cmp(a, b));

      let producedThisPeriod = false;
      for (const c of typed) {
        if (cmp(c, start) < 0) continue;
        if (rule.until !== undefined && cmp(c, rule.until) > 0) return;
        yield c;
        producedThisPeriod = true;
        emitted++;
        if (rule.count !== undefined && emitted >= rule.count) return;
      }

      if (producedThisPeriod) {
        emptyStreak = 0;
      } else if (++emptyStreak > MAX_EMPTY_PERIODS) {
        return; // rule produces nothing further; avoid spinning forever
      }

      state = advanceState(rule, state);
    }
  });
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
  if (!m) throw new RangeError(`temporal-seq: invalid BYDAY token "${token}"`);
  const weekday = m[2] as Weekday;
  return m[1] ? { weekday, nth: Number(m[1]) } : weekday;
}

function intList(value: string): number[] {
  return value.split(",").map((s) => Number(s.trim()));
}

/**
 * Build a {@link recur} sequence from an RFC 5545 RRULE string plus a DTSTART
 * value, e.g. `recurFromString("FREQ=MONTHLY;BYDAY=2TU;COUNT=12", start)`.
 */
export function recurFromString<T extends TemporalPoint>(rrule: string, dtstart: T): Seq<T> {
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
        if (!f) throw new RangeError(`temporal-seq: unsupported FREQ "${value}"`);
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
        throw new RangeError(`temporal-seq: unsupported RRULE part "${name}"`);
    }
  }
  if (!freqSeen) throw new RangeError("temporal-seq: RRULE is missing FREQ");
  return recur(rule);
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
