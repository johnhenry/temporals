import type { Temporal } from "temporal-polyfill";
import type { TemporalPoint, Weekday, WeekdaySpec } from "./types.js";
import type { RecurRule } from "./recur.js";
import { parseCron, type DayField, type ParsedCron } from "./cron.js";

/**
 * Best-effort humaniser and cron↔RRULE converters. Conversions are inherently
 * lossy — cron and RRULE have different models (matching vs stepping, the
 * day-of-month/day-of-week OR quirk, clock-alignment) — so the converters cover
 * the common patterns and return `null` when they can't map faithfully rather
 * than guessing.
 */

const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ORDINAL = ["", "first", "second", "third", "fourth", "fifth"];
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
  const hourPart = p.hour.wildcard ? "every hour" : `hours ${listNames(hours, [])}`;
  const minPart = p.minute.wildcard ? "every minute" : `minute ${listNames(mins, [])}`;
  return `at ${minPart} of ${hourPart}`;
}

function describeDom(dom: DayField): string {
  const bits: string[] = [];
  if (dom.values.size) bits.push(`day-of-month ${listNames(sorted(dom.values), [])}`);
  for (const off of dom.lastOffsets ?? []) {
    bits.push(off === 0 ? "the last day of the month" : `${off} day(s) before month end`);
  }
  if (dom.lastWeekday) bits.push("the last weekday of the month");
  for (const n of dom.nearestWeekday ?? []) bits.push(`the weekday nearest day ${n}`);
  return `on ${bits.join(" or ")}`;
}

function describeDow(dow: DayField): string {
  const bits: string[] = [];
  if (dow.values.size) bits.push(listNames(sorted(dow.values), DOW_FULL));
  for (const x of dow.nthWeekday ?? []) bits.push(`the ${ORDINAL[x.n]} ${DOW_FULL[x.wd]}`);
  for (const wd of dow.lastDow ?? []) bits.push(`the last ${DOW_FULL[wd]}`);
  return `on ${bits.join(" or ")}`;
}

/** A best-effort English description of a cron expression. */
export function describeCron(expr: string, seconds?: boolean): string {
  const p = parseCron(expr, seconds);
  const parts: string[] = [describeTime(p)];
  const domR = !p.dom.wildcard;
  const dowR = !p.dow.wildcard;
  if (domR && dowR) parts.push(`${describeDom(p.dom)} or ${describeDow(p.dow)} (cron OR)`);
  else if (domR) parts.push(describeDom(p.dom));
  else if (dowR) parts.push(describeDow(p.dow));
  if (!p.month.wildcard) parts.push(`in ${listNames(sorted(p.month.values), ["", ...MONTH_FULL])}`);
  return parts.join(", ");
}

/**
 * Best-effort cron → RRULE. Handles fixed time-of-day schedules (single hour +
 * minute) at daily / weekly / monthly / yearly cadence, including the Quartz
 * `L` (last day) and `d#n` / `dL` (nth / last weekday) specials. Returns `null`
 * for patterns RRULE can't faithfully represent (`W` nearest-weekday, the
 * day-of-month/day-of-week OR case, multi-hour/minute sets, mixed cadences).
 */
export function cronToRule<T extends TemporalPoint>(
  expr: string,
  start: T,
  seconds?: boolean,
): RecurRule<T> | null {
  const p = parseCron(expr, seconds);
  const hours = sorted(p.hour.values);
  const mins = sorted(p.minute.values);
  if (p.hour.wildcard || p.minute.wildcard || hours.length !== 1 || mins.length !== 1) return null;
  if (p.hasSeconds && (p.second.wildcard || p.second.values.size !== 1)) return null;

  const domR = !p.dom.wildcard;
  const dowR = !p.dow.wildcard;
  if (domR && dowR) return null; // OR semantics
  if (p.dom.nearestWeekday || p.dom.lastWeekday) return null; // W / LW not representable

  const byMonth = p.month.wildcard ? undefined : sorted(p.month.values);
  const rule: RecurRule<T> = { start, freq: "daily", byHour: [hours[0]!], byMinute: [mins[0]!] };
  if (p.hasSeconds) rule.bySecond = [[...p.second.values][0]!];
  if (byMonth) rule.byMonth = byMonth;

  if (dowR) {
    const nthCount = (p.dow.nthWeekday?.length ?? 0) + (p.dow.lastDow?.length ?? 0);
    if (nthCount > 0 && p.dow.values.size > 0) return null; // mixed weekly + monthly cadence
    const wds: WeekdaySpec[] = [
      ...sorted(p.dow.values).map((v) => CRON_DOW_TO_RRULE[v]!),
      ...(p.dow.nthWeekday ?? []).map((x) => ({ weekday: CRON_DOW_TO_RRULE[x.wd]!, nth: x.n })),
      ...(p.dow.lastDow ?? []).map((wd) => ({ weekday: CRON_DOW_TO_RRULE[wd]!, nth: -1 })),
    ];
    rule.freq = nthCount > 0 ? "monthly" : "weekly";
    rule.byWeekday = wds;
  } else if (domR) {
    const days = [...p.dom.values];
    for (const off of p.dom.lastOffsets ?? []) days.push(off === 0 ? -1 : -(off + 1));
    rule.freq = byMonth ? "yearly" : "monthly";
    rule.byMonthDay = days.sort((a, b) => a - b);
  } else if (byMonth) {
    rule.freq = "yearly";
  }
  return rule;
}

/**
 * Best-effort RRULE → cron. Handles fixed time-of-day daily / weekly / monthly /
 * yearly rules, emitting Quartz `L` for last-day / last-weekday and `d#n` for
 * nth-weekday. Returns `null` when the rule uses features cron can't express
 * (intervals, bySetPos, sub-daily, `nth` other than last, …).
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
    const tokens: string[] = [];
    for (const w of rule.byWeekday) {
      if (typeof w === "string") tokens.push(String(RRULE_TO_CRON_DOW[w]));
      else if (w.nth === undefined) tokens.push(String(RRULE_TO_CRON_DOW[w.weekday]));
      else if (w.nth === -1) tokens.push(`${RRULE_TO_CRON_DOW[w.weekday]}L`);
      else if (w.nth >= 1) tokens.push(`${RRULE_TO_CRON_DOW[w.weekday]}#${w.nth}`);
      else return null; // -2, -3, … have no cron form
    }
    dow = tokens.join(",");
  }
  if (rule.byMonthDay && rule.byMonthDay.length) {
    const tokens: string[] = [];
    for (const d of rule.byMonthDay) {
      if (d >= 1) tokens.push(String(d));
      else if (d === -1) tokens.push("L");
      else tokens.push(`L-${-d - 1}`);
    }
    dom = tokens.join(",");
  }
  return `${minute} ${hour} ${dom} ${month} ${dow}`;
}
