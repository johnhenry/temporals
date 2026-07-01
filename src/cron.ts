import type { Temporal } from "temporal-polyfill";
import { resolveWallToZoned } from "./internal.js";
import { Seq } from "./seq.js";
import { getTemporal } from "./temporal.js";

/**
 * Temporal-native cron. A cron expression is a *matching* schedule — "fire when
 * the wall clock matches these fields" — evaluated in an explicit time zone,
 * with explicit, correct DST behaviour (unlike most `Date`-based cron libs).
 *
 * Differences from RRULE that this module preserves faithfully:
 *  - Clock-aligned, not anchored to a start (`* /15` minutes = :00 :15 :30 :45).
 *  - The day-of-month / day-of-week OR quirk (Vixie cron): when BOTH are
 *    restricted, a day matches if EITHER matches.
 *
 * Field syntax: `*`, `?` (wildcard), `a`, `a-b`, `a-b/n`, `* /n`, `a/n`, comma
 * lists, and names (JAN…DEC, SUN…SAT). Sunday is 0 or 7. Quartz day specials
 * are supported: `L` / `L-n` / `LW` / `nW` in day-of-month, and `dL` / `d#n` in
 * day-of-week.
 */
export interface CronOptions {
  /** IANA time zone the expression is evaluated in (required — cron is wall-clock). */
  timeZone: string;
  /** Reference point; fire times are produced strictly after it. Defaults to now. */
  from?: Temporal.ZonedDateTime;
  /** Force seconds interpretation. By default a 6-field expression has a leading seconds field. */
  seconds?: boolean;
  /** Wall time that falls in a spring-forward gap: `"fire"` (shift forward, default) or `"skip"`. */
  dstGap?: "fire" | "skip";
  /** Wall time that repeats on fall-back: fire at the `"first"` (default) or `"second"` offset. */
  dstOverlap?: "first" | "second";
}

interface Field {
  values: Set<number>;
  wildcard: boolean;
}

/** Day-of-month / day-of-week field, carrying Quartz special day-rules. */
export interface DayField extends Field {
  /** dom: last day (`L` → 0) or `L-n` (→ n) offsets from month end. */
  lastOffsets?: number[];
  /** dom: nearest weekday to day n (`nW`). */
  nearestWeekday?: number[];
  /** dom: last weekday of the month (`LW`). */
  lastWeekday?: boolean;
  /** dow: the nth occurrence of a weekday (`d#n`). */
  nthWeekday?: { wd: number; n: number }[];
  /** dow: the last occurrence of a weekday in the month (`dL`). */
  lastDow?: number[];
}

export interface ParsedCron {
  second: Field;
  minute: Field;
  hour: Field;
  dom: DayField;
  month: Field;
  dow: DayField;
  hasSeconds: boolean;
}

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Expand a single comma-part (`a`, `a-b`, `a-b/n`, `* /n`, `a/n`) to numbers. */
function expandPart(part: string, min: number, max: number, names?: string[], namesBase = 0): number[] {
  const [rangePart, stepPart] = part.split("/");
  const step = stepPart !== undefined ? Number(stepPart) : 1;
  if (!Number.isInteger(step) || step < 1) {
    throw new RangeError(`temporals: invalid cron step "/${stepPart}"`);
  }
  const resolve = (s: string): number => {
    const idx = names?.indexOf(s.toUpperCase());
    if (idx !== undefined && idx >= 0) return idx + namesBase;
    const n = Number(s);
    if (!Number.isInteger(n)) throw new RangeError(`temporals: invalid cron value "${s}"`);
    return n;
  };
  let lo: number;
  let hi: number;
  if (rangePart === "*" || rangePart === undefined || rangePart === "") {
    lo = min;
    hi = max;
  } else if (rangePart.includes("-")) {
    const [a, b] = rangePart.split("-");
    lo = resolve(a!);
    hi = resolve(b!);
  } else {
    lo = resolve(rangePart);
    hi = stepPart !== undefined ? max : lo; // `a/n` means a..max step n
  }
  const out: number[] = [];
  for (let v = lo; v <= hi; v += step) out.push(v);
  return out;
}

function parseField(token: string, min: number, max: number, names?: string[], namesBase = 0): Field {
  if (token === "*" || token === "?") {
    const values = new Set<number>();
    for (let i = min; i <= max; i++) values.add(i);
    return { values, wildcard: true };
  }
  const values = new Set<number>();
  for (const part of token.split(",")) {
    for (const v of expandPart(part, min, max, names, namesBase)) {
      if (v < min || v > max) throw new RangeError(`temporals: cron value ${v} out of range ${min}-${max}`);
      values.add(v);
    }
  }
  return { values, wildcard: false };
}

function parseDayOfMonth(token: string): DayField {
  if (token === "*" || token === "?") {
    return { values: fullRange(1, 31), wildcard: true };
  }
  const f: DayField = { values: new Set(), wildcard: false };
  for (const part of token.split(",")) {
    const up = part.toUpperCase();
    if (up === "LW" || up === "WL") {
      f.lastWeekday = true;
      continue;
    }
    if (up === "L") {
      (f.lastOffsets ??= []).push(0);
      continue;
    }
    const lm = /^L-(\d+)$/.exec(up);
    if (lm) {
      (f.lastOffsets ??= []).push(Number(lm[1]));
      continue;
    }
    const wm = /^(\d+)W$/.exec(up);
    if (wm) {
      const n = Number(wm[1]);
      if (n < 1 || n > 31) throw new RangeError(`temporals: invalid cron "${part}" (day 1-31)`);
      (f.nearestWeekday ??= []).push(n);
      continue;
    }
    for (const v of expandPart(part, 1, 31)) {
      if (v < 1 || v > 31) throw new RangeError(`temporals: cron day-of-month ${v} out of range 1-31`);
      f.values.add(v);
    }
  }
  return f;
}

function resolveDow(s: string): number {
  const idx = DOW_NAMES.indexOf(s.toUpperCase());
  const n = idx >= 0 ? idx : Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 7) throw new RangeError(`temporals: invalid weekday "${s}"`);
  return n % 7;
}

function parseDayOfWeek(token: string): DayField {
  if (token === "*" || token === "?") {
    return { values: fullRange(0, 6), wildcard: true };
  }
  const f: DayField = { values: new Set(), wildcard: false };
  for (const part of token.split(",")) {
    const up = part.toUpperCase();
    const hash = /^(.+)#(\d+)$/.exec(up);
    if (hash) {
      const n = Number(hash[2]);
      if (n < 1 || n > 5) throw new RangeError(`temporals: invalid cron "${part}" (nth 1-5)`);
      (f.nthWeekday ??= []).push({ wd: resolveDow(hash[1]!), n });
      continue;
    }
    if (up !== "L" && up.endsWith("L")) {
      (f.lastDow ??= []).push(resolveDow(up.slice(0, -1)));
      continue;
    }
    if (up === "L") {
      f.values.add(6); // Quartz: bare L in day-of-week is Saturday
      continue;
    }
    for (const v of expandPart(part, 0, 7, DOW_NAMES, 0)) {
      if (v < 0 || v > 7) throw new RangeError(`temporals: cron day-of-week ${v} out of range 0-7`);
      f.values.add(v % 7);
    }
  }
  return f;
}

function fullRange(min: number, max: number): Set<number> {
  const s = new Set<number>();
  for (let i = min; i <= max; i++) s.add(i);
  return s;
}

/** Parse a cron expression (5-field, or 6-field with a leading seconds field) or a `@macro`. */
export function parseCron(expr: string, seconds?: boolean): ParsedCron {
  let text = expr.trim();
  if (text.startsWith("@")) {
    const macro = MACROS[text.toLowerCase()];
    if (!macro) throw new RangeError(`temporals: unknown cron macro "${text}"`);
    text = macro;
  }
  const fields = text.split(/\s+/);
  let hasSeconds: boolean;
  if (seconds === true) hasSeconds = true;
  else if (seconds === false) hasSeconds = false;
  else hasSeconds = fields.length === 6;

  if (fields.length !== (hasSeconds ? 6 : 5)) {
    throw new RangeError(
      `temporals: expected ${hasSeconds ? 6 : 5} cron fields, got ${fields.length} in "${expr}"`,
    );
  }

  let i = 0;
  const secondF = hasSeconds ? parseField(fields[i++]!, 0, 59) : { values: new Set([0]), wildcard: false };
  const minute = parseField(fields[i++]!, 0, 59);
  const hour = parseField(fields[i++]!, 0, 23);
  const dom = parseDayOfMonth(fields[i++]!);
  const month = parseField(fields[i++]!, 1, 12, MONTH_NAMES, 1);
  const dow = parseDayOfWeek(fields[i++]!);

  return { second: secondF, minute, hour, dom, month, dow, hasSeconds };
}

/** Cron day-of-week (Sun=0…Sat=6) for a Temporal date (dayOfWeek Mon=1…Sun=7). */
function cronDow(dayOfWeek: number): number {
  return dayOfWeek % 7;
}

/** Day (1-based) of the last Mon–Fri in the month of `dt`. */
function lastWeekdayDay(dt: Temporal.PlainDateTime): number {
  let d = dt.daysInMonth;
  while (dt.with({ day: d }).dayOfWeek > 5) d--;
  return d;
}

/** Day of the weekday nearest to `target` within the month (Quartz `W`, no month crossing). */
function nearestWeekdayDay(dt: Temporal.PlainDateTime, target: number): number {
  const dim = dt.daysInMonth;
  let day = Math.min(Math.max(target, 1), dim);
  const dow = dt.with({ day }).dayOfWeek; // 1..7
  if (dow === 6) day = day > 1 ? day - 1 : day + 2; // Sat -> Fri, or Mon if the 1st
  else if (dow === 7) day = day < dim ? day + 1 : day - 2; // Sun -> Mon, or Fri if the last
  return day;
}

function domMatches(dom: DayField, dt: Temporal.PlainDateTime): boolean {
  if (dom.wildcard) return true;
  if (dom.values.has(dt.day)) return true;
  if (dom.lastOffsets?.some((off) => dt.day === dt.daysInMonth - off)) return true;
  if (dom.lastWeekday && dt.day === lastWeekdayDay(dt)) return true;
  if (dom.nearestWeekday?.some((n) => dt.day === nearestWeekdayDay(dt, n))) return true;
  return false;
}

function dowMatches(dow: DayField, dt: Temporal.PlainDateTime): boolean {
  if (dow.wildcard) return true;
  const c = cronDow(dt.dayOfWeek);
  if (dow.values.has(c)) return true;
  if (dow.nthWeekday?.some((x) => c === x.wd && Math.ceil(dt.day / 7) === x.n)) return true;
  if (dow.lastDow?.some((wd) => c === wd && dt.day + 7 > dt.daysInMonth)) return true;
  return false;
}

function dayMatches(p: ParsedCron, dt: Temporal.PlainDateTime): boolean {
  const domR = !p.dom.wildcard;
  const dowR = !p.dow.wildcard;
  if (domR && dowR) return domMatches(p.dom, dt) || dowMatches(p.dow, dt); // Vixie OR quirk
  if (domR) return domMatches(p.dom, dt);
  if (dowR) return dowMatches(p.dow, dt);
  return true;
}

const ZERO_SUBSECOND = { millisecond: 0, microsecond: 0, nanosecond: 0 };
const MAX_SCAN = 500_000;

/** Least wall-clock time matching `p` that is > `from` (or >= if `inclusive`). */
function nextMatch(p: ParsedCron, from: Temporal.PlainDateTime, inclusive: boolean): Temporal.PlainDateTime {
  const unit = p.hasSeconds ? "second" : "minute";
  let t =
    unit === "second" ? from.with(ZERO_SUBSECOND) : from.with({ second: 0, ...ZERO_SUBSECOND });
  if (!inclusive) t = t.add(unit === "second" ? { seconds: 1 } : { minutes: 1 });

  for (let guard = 0; guard < MAX_SCAN; guard++) {
    if (!p.month.values.has(t.month)) {
      t = t.with({ day: 1, hour: 0, minute: 0, second: 0, ...ZERO_SUBSECOND }).add({ months: 1 });
      continue;
    }
    if (!dayMatches(p, t)) {
      t = t.with({ hour: 0, minute: 0, second: 0, ...ZERO_SUBSECOND }).add({ days: 1 });
      continue;
    }
    if (!p.hour.values.has(t.hour)) {
      t = t.with({ minute: 0, second: 0, ...ZERO_SUBSECOND }).add({ hours: 1 });
      continue;
    }
    if (!p.minute.values.has(t.minute)) {
      t = t.with({ second: 0, ...ZERO_SUBSECOND }).add({ minutes: 1 });
      continue;
    }
    if (p.hasSeconds && !p.second.values.has(t.second)) {
      t = t.add({ seconds: 1 });
      continue;
    }
    return t;
  }
  throw new RangeError("temporals: cron expression matches no valid date (impossible schedule?)");
}

/** Internal: lazy zoned occurrences at/after `from` (strict unless `inclusive`). */
export function cronOccurrences(
  parsed: ParsedCron,
  from: Temporal.ZonedDateTime,
  opts: CronOptions,
  inclusive: boolean,
): Seq<Temporal.ZonedDateTime> {
  const timeZone = opts.timeZone;
  const startWall = from.withTimeZone(timeZone).toPlainDateTime();
  return new Seq<Temporal.ZonedDateTime>(function* () {
    let wall = startWall;
    let first = inclusive;
    while (true) {
      const match = nextMatch(parsed, wall, first);
      first = false;
      wall = match;
      const zdt = resolveWallToZoned(match, timeZone, opts);
      if (zdt) yield zdt;
    }
  });
}

/**
 * A lazy sequence of upcoming fire times (as `ZonedDateTime`) for a cron
 * expression, strictly after `options.from` (default: now).
 *
 * ```ts
 * cron("0 9 * * 1-5", { timeZone: "America/New_York" }).take(3).toArray();
 * ```
 */
export function cron(expr: string, options: CronOptions): Seq<Temporal.ZonedDateTime> {
  const parsed = parseCron(expr, options.seconds);
  const from = options.from ?? getTemporal().Now.zonedDateTimeISO(options.timeZone);
  return cronOccurrences(parsed, from, options, false);
}
