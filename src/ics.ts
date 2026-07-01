import type { Temporal } from "temporal-polyfill";
import type { TemporalPoint } from "./types.js";
import { kindOf } from "./internal.js";
import { formatRule, recur, ruleFromString, type RecurRule } from "./recur.js";
import type { Seq } from "./seq.js";
import { getTemporal } from "./temporal.js";

/**
 * Minimal iCalendar (RFC 5545) import/export for recurring events — DTSTART,
 * DTEND, RRULE, EXDATE, RDATE, plus UID/SUMMARY. Public entry for the
 * `temporals/ics` subpath. Round-trips with {@link recur} (RRULE + EXDATE/RDATE).
 */

export interface ICSEvent<T extends TemporalPoint = TemporalPoint> {
  uid?: string;
  summary?: string;
  start: T;
  end?: T;
  /** RRULE string or a structured rule. */
  rrule?: string | RecurRule<T>;
  /** EXDATE — occurrences to remove. */
  exdate?: T[];
  /** RDATE — extra occurrences to add. */
  rdate?: T[];
}

const pad = (n: number, len = 2) => String(Math.abs(n)).padStart(len, "0");

function packDateTime(dt: { year: number; month: number; day: number; hour: number; minute: number; second: number }): string {
  return `${pad(dt.year, 4)}${pad(dt.month)}${pad(dt.day)}T${pad(dt.hour)}${pad(dt.minute)}${pad(dt.second)}`;
}

/** ICS property params + value text for a Temporal point. */
function icsValue(v: TemporalPoint): { params: string; text: string } {
  const k = kindOf(v);
  if (k === "date") {
    const d = v as Temporal.PlainDate;
    return { params: ";VALUE=DATE", text: `${pad(d.year, 4)}${pad(d.month)}${pad(d.day)}` };
  }
  if (k === "zoneddatetime") {
    const z = v as Temporal.ZonedDateTime;
    return { params: `;TZID=${z.timeZoneId}`, text: packDateTime(z.toPlainDateTime()) };
  }
  if (k === "instant") {
    const inst = v as Temporal.Instant;
    return { params: "", text: `${packDateTime(inst.toZonedDateTimeISO("UTC").toPlainDateTime())}Z` };
  }
  return { params: "", text: packDateTime(v as Temporal.PlainDateTime) };
}

function groupDates(name: string, dates: TemporalPoint[]): string {
  if (dates.length === 0) return "";
  const params = icsValue(dates[0]!).params;
  const text = dates.map((d) => icsValue(d).text).join(",");
  return `${name}${params}:${text}`;
}

/** Serialise events to an iCalendar (`.ics`) string (CRLF line endings). */
export function toICS(events: ICSEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//temporals//EN", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    if (e.uid) lines.push(`UID:${e.uid}`);
    if (e.summary) lines.push(`SUMMARY:${e.summary}`);
    const s = icsValue(e.start);
    lines.push(`DTSTART${s.params}:${s.text}`);
    if (e.end) {
      const en = icsValue(e.end);
      lines.push(`DTEND${en.params}:${en.text}`);
    }
    if (e.rrule) {
      lines.push(`RRULE:${typeof e.rrule === "string" ? e.rrule.replace(/^RRULE:/i, "") : formatRule(e.rrule)}`);
    }
    if (e.exdate?.length) lines.push(groupDates("EXDATE", e.exdate));
    if (e.rdate?.length) lines.push(groupDates("RDATE", e.rdate));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function parseICSDate(params: Record<string, string>, text: string): TemporalPoint {
  const T = getTemporal();
  const iso = (s: string) =>
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
    (s.length > 8 ? `T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}` : "");
  if (params["VALUE"] === "DATE") return T.PlainDate.from(iso(text));
  if (params["TZID"]) return T.ZonedDateTime.from(`${iso(text)}[${params["TZID"]}]`);
  if (text.endsWith("Z")) return T.Instant.from(`${iso(text.slice(0, -1))}Z`);
  return T.PlainDateTime.from(iso(text));
}

function splitProp(line: string): { name: string; params: Record<string, string>; value: string } {
  const colon = line.indexOf(":");
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name!.toUpperCase(), params, value };
}

/** Parse an iCalendar string into events (Temporal values, RRULE as a string). */
export function fromICS(text: string): ICSEvent[] {
  // Unfold RFC 5545 line continuations (CRLF + space/tab).
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events: ICSEvent[] = [];
  let cur: ICSEvent | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      cur = { start: undefined as unknown as TemporalPoint };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur || !line.includes(":")) continue;
    const { name, params, value } = splitProp(line);
    switch (name) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = value;
        break;
      case "DTSTART":
        cur.start = parseICSDate(params, value);
        break;
      case "DTEND":
        cur.end = parseICSDate(params, value);
        break;
      case "RRULE":
        cur.rrule = value;
        break;
      case "EXDATE":
        cur.exdate = value.split(",").map((v) => parseICSDate(params, v));
        break;
      case "RDATE":
        cur.rdate = value.split(",").map((v) => parseICSDate(params, v));
        break;
    }
  }
  return events;
}

/** Turn a parsed (or constructed) ICS event into a lazy occurrence sequence. */
export function icsToSeq<T extends TemporalPoint>(event: ICSEvent<T>): Seq<T> {
  if (!event.rrule) throw new RangeError("temporals: icsToSeq requires an event with an RRULE");
  const rule =
    typeof event.rrule === "string" ? ruleFromString(event.rrule, event.start) : event.rrule;
  return recur({ ...rule, include: event.rdate, exclude: event.exdate });
}
