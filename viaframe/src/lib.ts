// The part of @johnhenry/temporals the viaframe panes use, plus the small adapter that turns a pane's
// parameters (JSON: strings, numbers, lists) into Temporal values and back. scripts/build.mjs bundles
// this file, with temporal-polyfill as the fallback for a runtime without a native Temporal, into one
// script that every pane's code carries (a pane package can't import a module or share code between
// its panes: README.md in this folder, "How the panes carry the library").
//
// Everything a pane returns is plain data (strings, numbers, booleans, arrays, objects), so its value
// can be shown, compared by a test, saved and sent between panes.
import { Temporal as Polyfill } from "temporal-polyfill";
import { configureTemporal, getTemporal } from "../../src/temporal.js";
import {
  BusinessCalendar,
  Holidays,
  WorkingHours,
  businessDuration,
  easterHoliday,
  fixedHoliday,
  nthWeekdayHoliday,
  usFederalHolidays,
  type HolidayRule,
  type Window,
} from "../../src/business.js";
import { formatRelative, humanizeDuration, parseDuration, type HumanizeOptions } from "../../src/humanize.js";
import { recurFromString } from "../../src/recur.js";
import type { Weekday } from "../../src/types.js";

type TemporalNS = typeof Polyfill;
type ZDT = InstanceType<TemporalNS["ZonedDateTime"]>;
type Duration = InstanceType<TemporalNS["Duration"]>;
type PlainDate = InstanceType<TemporalNS["PlainDate"]>;

/** Native Temporal when the runtime has it (Node 26, current Chromium), else the bundled polyfill. */
const native = (globalThis as unknown as { Temporal?: TemporalNS }).Temporal;
configureTemporal(native ?? Polyfill);
const T = (): TemporalNS => getTemporal();

/** Which Temporal the panes are using: "native" or "temporal-polyfill". */
export const temporalSource = native ? "native" : "temporal-polyfill";

const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** A weekday as the library's code: "SA", "sat", "Saturday" or 1-7 (ISO: 1 is Monday, 7 is Sunday). */
export function weekdayCode(day: unknown): Weekday {
  if (typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7) return WEEKDAYS[day - 1]!;
  const text = String(day ?? "").trim().slice(0, 2).toUpperCase();
  const code = WEEKDAYS.find((w) => w === text);
  if (!code) throw new RangeError(`not a weekday: ${JSON.stringify(day)} (use MO-SU, or 1-7 with 1 for Monday)`);
  return code;
}

const NAMED: Record<string, () => HolidayRule[]> = {
  easter: () => [easterHoliday(0)],
  "good-friday": () => [easterHoliday(-2)],
  "easter-monday": () => [easterHoliday(1)],
};

/** A holiday spec, as a pane takes it. */
export type HolidaySpec =
  | string // "us-federal", "easter", "good-friday", "easter-monday", "2026-12-24" (that date), "12-25" (every year)
  | { month: number; day: number; observed?: boolean | "us" | "uk" }
  | { month: number; weekday: string | number; nth: number }
  | { easter: number };

/** One spec as holiday rules; throws a RangeError that names the spec it can't read. */
export function holidayRules(spec: HolidaySpec): HolidayRule[] {
  if (typeof spec === "string") {
    const s = spec.trim().toLowerCase();
    if (s === "us-federal") return usFederalRules();
    if (NAMED[s]) return NAMED[s]!();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const date = T().PlainDate.from(s);
      return [(year) => (year === date.year ? date : null)];
    }
    m = /^(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return [fixedHoliday(Number(m[1]), Number(m[2]))];
    throw new RangeError(`not a holiday: ${JSON.stringify(spec)} (use us-federal, easter, good-friday, easter-monday, a date like 2026-12-24, a month and day like 12-25, or an object)`);
  }
  if (spec && typeof spec === "object") {
    if ("easter" in spec) return [easterHoliday(Number(spec.easter) || 0)];
    if ("weekday" in spec) return [nthWeekdayHoliday(Number(spec.month), weekdayCode(spec.weekday), Number(spec.nth))];
    if ("day" in spec) return [fixedHoliday(Number(spec.month), Number(spec.day), { observed: spec.observed ?? false })];
  }
  throw new RangeError(`not a holiday: ${JSON.stringify(spec)}`);
}

function usFederalRules(): HolidayRule[] {
  // Holidays keeps its rules private and can't be merged with another set, so ask it for each year's
  // dates instead: one rule per place in that year's sorted list (the 11 holidays).
  const set = usFederalHolidays();
  return Array.from({ length: 11 }, (_, i) => (year: number) => set.inYear(year)[i] ?? null);
}

/** A business-day calendar from a weekend (weekday codes) and a list of holiday specs. */
export function businessCalendar(opts: { weekend?: unknown[]; holidays?: HolidaySpec[] } = {}): BusinessCalendar {
  const weekend = (opts.weekend ?? ["SA", "SU"]).map(weekdayCode);
  const rules = (opts.holidays ?? []).flatMap(holidayRules);
  return new BusinessCalendar({ weekend, holidays: rules.length ? Holidays.of(...rules) : undefined });
}

/** Working hours from windows like [["09:00", "17:00"]] (a window that ends before it starts crosses midnight). */
export function workingHours(opts: { windows?: unknown; weekend?: unknown[]; holidays?: HolidaySpec[] } = {}): WorkingHours {
  const windows = (Array.isArray(opts.windows) && opts.windows.length ? opts.windows : [["09:00", "17:00"]]).map((w) => {
    if (!Array.isArray(w) || w.length !== 2) throw new RangeError(`a window is [open, close], like ["09:00", "17:00"]: ${JSON.stringify(w)}`);
    return [String(w[0]), String(w[1])] as Window;
  });
  return new WorkingHours({ windows, calendar: businessCalendar(opts) });
}

/**
 * An instant read in a zone. Takes an ISO time with an offset or Z (that instant), one with a bracketed
 * zone (that instant), a wall-clock time without either (read in `zone`), or epoch milliseconds.
 */
export function zoned(at: unknown, zone: string): ZDT {
  const t = T();
  const tz = String(zone || "UTC");
  if (typeof at === "number") return t.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(tz);
  const s = String(at ?? "").trim();
  if (!s) throw new RangeError("no time given");
  if (s.includes("[")) return t.ZonedDateTime.from(s).withTimeZone(tz);
  if (/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(s) && s.includes("T")) return t.Instant.from(s).toZonedDateTimeISO(tz);
  return t.PlainDateTime.from(s).toZonedDateTime(tz);
}

/** A date: "2026-10-23", or the date part of any time `zoned` reads. */
export function plainDate(value: unknown, zone = "UTC"): PlainDate {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return T().PlainDate.from(s);
  return zoned(value, zone).toPlainDate();
}

/** A duration from milliseconds (a number), an ISO 8601 duration ("PT1H30M") or shorthand ("1h 30m", "2d"). */
export function duration(value: unknown): Duration {
  const t = T();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`not a duration: ${value}`);
    return t.Duration.from({ milliseconds: Math.trunc(value) }).round({ largestUnit: "day", smallestUnit: "millisecond" });
  }
  const s = String(value ?? "").trim();
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return duration(Number(s));
  if (/^-?P/i.test(s)) return t.Duration.from(s.toUpperCase());
  return parseDuration(s);
}

/** Milliseconds in a duration made only of days (24 h) and smaller units. */
export function durationMs(d: Duration): number {
  if (d.years || d.months || d.weeks) throw new RangeError(`years, months and weeks have no fixed length: ${d.toString()}`);
  return d.total({ unit: "millisecond" });
}

/** Words for a number of milliseconds (or any duration `duration` reads), largest units first. */
export function words(value: unknown, opts: HumanizeOptions & { largestUnit?: string } = {}): string {
  let d = duration(value);
  if (!d.years && !d.months && !d.weeks) {
    d = d.round({ largestUnit: (opts.largestUnit as "day") || "day", smallestUnit: "millisecond" });
  }
  return humanizeDuration(d, opts);
}

/** An instant as the ISO string with its zone, without sub-second zeros: 2026-10-23T09:00:00-04:00[America/New_York]. */
export const iso = (z: ZDT): string => z.toString({ smallestUnit: "second" });

export { BusinessCalendar, WorkingHours, businessDuration, formatRelative, humanizeDuration, parseDuration, recurFromString };
export const Temporal = (): TemporalNS => T();
