import type { Temporal } from "temporal-polyfill";
import type { TemporalPoint, Weekday, WeekdaySpec } from "./types.js";
import type { RecurRule } from "./recur.js";
import { parseCron, type ParsedCron } from "./cron.js";

/**
 * Best-effort humaniser and cron↔RRULE converters. Conversions are inherently
 * lossy — cron and RRULE have different models (matching vs stepping, the
 * day-of-month/day-of-week OR quirk, clock-alignment) — so the converters cover
 * the common "fixed time of day" patterns and return `null` when they can't map
 * a rule faithfully rather than guessing.
 */

const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CRON_DOW_TO_RRULE: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const RRULE_TO_CRON_DOW: Record<Weekday, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const pad = (n: number) => String(n).padStart(2, "0");
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

function listNames(values: number[], names: string[]): string {
  const labels = values.map((v) => names[v] ?? String(v));
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function describeTime(p: ParsedCron): string {
  const mins = sorted(p.minute.values);
  const hours = sorted(p.hour.values);
  const secPart =
    p.hasSeconds && !p.second.wildcard && p.second.values.size === 1
      ? `:${pad([...p.second.values][0]!)}`
      : "";
  if (!p.hour.wildcard && hours.length === 1 && !p.minute.wildcard && mins.length === 1) {
    return `at ${pad(hours[0]!)}:${pad(mins[0]!)}${secPart}`;
  }
  if (p.hour.wildcard && !p.minute.wildcard && mins.length === 1) {
    return `at ${mins[0]} minutes past every hour`;
  }
  if (p.minute.wildcard && p.hour.wildcard) return "every minute";
  if (!p.minute.wildcard && mins.length > 1 && p.hour.wildcard) {
    return `at minutes ${listNames(mins, [])} of every hour`;
  }
  const hourPart = p.hour.wildcard ? "every hour" : `hours ${listNames(hours, [])}`;
  const minPart = p.minute.wildcard ? "every minute" : `minute ${listNames(mins, [])}`;
  return `at ${minPart} of ${hourPart}`;
}

/** A best-effort English description of a cron expression. */
export function describeCron(expr: string, seconds?: boolean): string {
  const p = parseCron(expr, seconds);
  const parts: string[] = [describeTime(p)];

  const domR = !p.dom.wildcard;
  const dowR = !p.dow.wildcard;
  if (domR && dowR) {
    parts.push(
      `on day-of-month ${listNames(sorted(p.dom.values), [])} or on ${listNames(sorted(p.dow.values), DOW_FULL)} (cron OR)`,
    );
  } else if (domR) {
    parts.push(`on day-of-month ${listNames(sorted(p.dom.values), [])}`);
  } else if (dowR) {
    parts.push(`on ${listNames(sorted(p.dow.values), DOW_FULL)}`);
  }
  if (!p.month.wildcard) {
    parts.push(`in ${listNames(sorted(p.month.values), ["", ...MONTH_FULL])}`);
  }
  return parts.join(", ");
}

/**
 * Best-effort cron → RRULE. Handles fixed time-of-day schedules (single hour +
 * minute) at daily / weekly / monthly / yearly cadence. Returns `null` for
 * patterns RRULE can't faithfully represent (e.g. the day-of-month/day-of-week
 * OR case, or multi-hour/minute sets).
 */
export function cronToRule<T extends TemporalPoint>(
  expr: string,
  start: T,
  seconds?: boolean,
): RecurRule<T> | null {
  const p = parseCron(expr, seconds);
  const hours = sorted(p.hour.values);
  const mins = sorted(p.minute.values);
  if (p.hour.wildcard || p.minute.wildcard || hours.length !== 1 || mins.length !== 1) {
    return null; // not a single fixed time-of-day
  }
  if (p.hasSeconds && (p.second.wildcard || p.second.values.size !== 1)) return null;

  const domR = !p.dom.wildcard;
  const dowR = !p.dow.wildcard;
  if (domR && dowR) return null; // OR semantics — not representable

  const byHour = [hours[0]!];
  const byMinute = [mins[0]!];
  const bySecond = p.hasSeconds ? [[...p.second.values][0]!] : undefined;
  const byMonth = p.month.wildcard ? undefined : sorted(p.month.values);

  const rule: RecurRule<T> = { start, freq: "daily", byHour, byMinute };
  if (bySecond) rule.bySecond = bySecond;
  if (byMonth) rule.byMonth = byMonth;

  if (dowR) {
    rule.freq = "weekly";
    rule.byWeekday = sorted(p.dow.values).map((d) => CRON_DOW_TO_RRULE[d]!);
  } else if (domR) {
    rule.freq = byMonth ? "yearly" : "monthly";
    rule.byMonthDay = sorted(p.dom.values);
  } else if (byMonth) {
    rule.freq = "yearly";
  }
  return rule;
}

/**
 * Best-effort RRULE → cron. Handles fixed time-of-day daily / weekly / monthly /
 * yearly rules. Returns `null` when the rule uses features cron can't express
 * (intervals, nth-weekday, bySetPos, sub-daily, negative month-days, …).
 */
export function ruleToCron(rule: RecurRule): string | null {
  if (rule.interval && rule.interval !== 1) return null;
  if (rule.bySetPos || rule.byWeekNo || rule.byYearDay) return null;
  if (["hourly", "minutely", "secondly"].includes(rule.freq)) return null;

  const hour = rule.byHour && rule.byHour.length === 1 ? rule.byHour[0]! : undefined;
  const minute = rule.byMinute && rule.byMinute.length === 1 ? rule.byMinute[0]! : 0;
  if (hour === undefined) return null;

  const month = rule.byMonth && rule.byMonth.length ? rule.byMonth.join(",") : "*";

  let dom = "*";
  let dow = "*";
  if (rule.byWeekday && rule.byWeekday.length) {
    const nums: number[] = [];
    for (const w of rule.byWeekday) {
      if (typeof w !== "string") return null; // nth-weekday not expressible
      nums.push(RRULE_TO_CRON_DOW[w]);
    }
    dow = nums.sort((a, b) => a - b).join(",");
  }
  if (rule.byMonthDay && rule.byMonthDay.length) {
    if (rule.byMonthDay.some((d) => d < 1)) return null; // negatives not expressible
    dom = rule.byMonthDay.join(",");
  }
  return `${minute} ${hour} ${dom} ${month} ${dow}`;
}
