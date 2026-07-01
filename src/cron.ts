import type { Temporal } from "temporal-polyfill";
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
 * Supported field syntax: `*`, `?` (as wildcard), `a`, `a-b`, `a-b/n`, `* /n`,
 * `a/n`, comma lists, and names (JAN…DEC, SUN…SAT). Sunday is 0 or 7.
 * Not supported: `L`, `W`, `#` (throws) — planned.
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

export interface ParsedCron {
  second: Field;
  minute: Field;
  hour: Field;
  dom: Field;
  month: Field;
  dow: Field;
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

function parseField(
  token: string,
  min: number,
  max: number,
  names?: string[],
  namesBase = 0,
): Field {
  if (token === "*" || token === "?") {
    const values = new Set<number>();
    for (let i = min; i <= max; i++) values.add(i);
    return { values, wildcard: true };
  }
  const values = new Set<number>();
  const resolveName = (s: string): number => {
    const up = s.toUpperCase();
    const idx = names?.indexOf(up);
    if (idx !== undefined && idx >= 0) return idx + namesBase;
    const n = Number(s);
    if (!Number.isInteger(n)) throw new RangeError(`temporals: invalid cron value "${s}"`);
    return n;
  };
  for (const part of token.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart !== undefined ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1) {
      throw new RangeError(`temporals: invalid cron step "/${stepPart}"`);
    }
    let lo: number;
    let hi: number;
    if (rangePart === "*" || rangePart === undefined || rangePart === "") {
      lo = min;
      hi = max;
    } else if (rangePart!.includes("-")) {
      const [a, b] = rangePart!.split("-");
      lo = resolveName(a!);
      hi = resolveName(b!);
    } else {
      lo = resolveName(rangePart!);
      hi = stepPart !== undefined ? max : lo; // `a/n` means a..max step n
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { values, wildcard: false };
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
  for (const f of fields) {
    if (/[LW#]/i.test(f)) {
      throw new RangeError(`temporals: cron special characters L/W/# are not supported ("${f}")`);
    }
  }

  let i = 0;
  const secondF = hasSeconds ? parseField(fields[i++]!, 0, 59) : { values: new Set([0]), wildcard: false };
  const minute = parseField(fields[i++]!, 0, 59);
  const hour = parseField(fields[i++]!, 0, 23);
  const dom = parseField(fields[i++]!, 1, 31);
  const month = parseField(fields[i++]!, 1, 12, MONTH_NAMES, 1);
  const dowRaw = parseField(fields[i++]!, 0, 7, DOW_NAMES, 0);
  // Normalise Sunday: 7 -> 0.
  const dow: Field = {
    wildcard: dowRaw.wildcard,
    values: new Set([...dowRaw.values].map((v) => v % 7)),
  };

  return { second: secondF, minute, hour, dom, month, dow, hasSeconds };
}

/** Cron day-of-week (Sun=0…Sat=6) for a Temporal date (dayOfWeek Mon=1…Sun=7). */
function cronDow(dayOfWeek: number): number {
  return dayOfWeek % 7;
}

function dayMatches(p: ParsedCron, dt: Temporal.PlainDateTime): boolean {
  const domRestricted = !p.dom.wildcard;
  const dowRestricted = !p.dow.wildcard;
  const domHit = p.dom.values.has(dt.day);
  const dowHit = p.dow.values.has(cronDow(dt.dayOfWeek));
  if (domRestricted && dowRestricted) return domHit || dowHit; // Vixie OR quirk
  if (domRestricted) return domHit;
  if (dowRestricted) return dowHit;
  return true;
}

const ZERO_SUBSECOND = { millisecond: 0, microsecond: 0, nanosecond: 0 };
const MAX_SCAN = 500_000;

/** Least wall-clock time matching `p` that is > `from` (or >= if `inclusive`). */
function nextMatch(
  p: ParsedCron,
  from: Temporal.PlainDateTime,
  inclusive: boolean,
): Temporal.PlainDateTime {
  const unit = p.hasSeconds ? "second" : "minute";
  let t =
    unit === "second"
      ? from.with(ZERO_SUBSECOND)
      : from.with({ second: 0, ...ZERO_SUBSECOND });
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

/** Resolve a wall-clock match to a zoned instant under the DST policy, or null to skip. */
function resolveWall(
  wall: Temporal.PlainDateTime,
  timeZone: string,
  opts: CronOptions,
): Temporal.ZonedDateTime | null {
  const compatible = wall.toZonedDateTime(timeZone, { disambiguation: "compatible" });
  const isGap = !compatible.toPlainDateTime().equals(wall);
  if (isGap) {
    return (opts.dstGap ?? "fire") === "skip" ? null : compatible;
  }
  const earlier = wall.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  const later = wall.toZonedDateTime(timeZone, { disambiguation: "later" });
  const isOverlap = !earlier.equals(later);
  if (isOverlap) {
    return (opts.dstOverlap ?? "first") === "second" ? later : earlier;
  }
  return compatible;
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
      const zdt = resolveWall(match, timeZone, opts);
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
  const from =
    options.from ?? getTemporal().Now.zonedDateTimeISO(options.timeZone);
  return cronOccurrences(parsed, from, options, false);
}
