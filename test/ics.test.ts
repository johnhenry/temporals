import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { toICS, fromICS, icsToSeq } from "../src/ics.js";
import { ruleFromString, formatRule } from "../src/recur.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);

test("toICS: serialises an all-day recurring event with EXDATE/RDATE", () => {
  const ics = toICS([
    {
      uid: "x@temporals",
      summary: "Standup",
      start: D("2026-01-01"),
      rrule: "FREQ=WEEKLY;COUNT=4",
      exdate: [D("2026-01-08")],
      rdate: [D("2026-01-03")],
    },
  ]);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260101/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;COUNT=4/);
  assert.match(ics, /EXDATE;VALUE=DATE:20260108/);
  assert.match(ics, /RDATE;VALUE=DATE:20260103/);
});

test("fromICS: parses events back to Temporal values", () => {
  const ics = toICS([
    { start: D("2026-01-01"), rrule: "FREQ=WEEKLY;COUNT=4", exdate: [D("2026-01-08")], rdate: [D("2026-01-03")] },
  ]);
  const [e] = fromICS(ics);
  assert.equal(e!.start.toString(), "2026-01-01");
  assert.equal(e!.rrule, "FREQ=WEEKLY;COUNT=4");
  assert.deepEqual(e!.exdate!.map(String), ["2026-01-08"]);
  assert.deepEqual(e!.rdate!.map(String), ["2026-01-03"]);
});

test("icsToSeq: RRULE + EXDATE + RDATE expand correctly", () => {
  const [e] = fromICS(
    toICS([
      { start: D("2026-01-01"), rrule: "FREQ=WEEKLY;COUNT=4", exdate: [D("2026-01-08")], rdate: [D("2026-01-03")] },
    ]),
  );
  assert.deepEqual(
    icsToSeq(e!).toArray().map(String),
    ["2026-01-01", "2026-01-03", "2026-01-15", "2026-01-22"],
  );
});

test("ICS round-trips a zoned event (TZID)", () => {
  const ics = toICS([{ start: Z("2026-03-01T09:00"), rrule: "FREQ=DAILY;COUNT=2" }]);
  assert.match(ics, /DTSTART;TZID=America\/New_York:20260301T090000/);
  const [e] = fromICS(ics);
  assert.equal(e!.start.toString(), "2026-03-01T09:00:00-05:00[America/New_York]");
  assert.deepEqual(
    icsToSeq(e!).toArray().map((z) => (z as Temporal.ZonedDateTime).toPlainDate().toString()),
    ["2026-03-01", "2026-03-02"],
  );
});

test("toICS: UNTIL on a zoned rule is emitted in RFC 5545 UTC form", () => {
  // Regression for https://github.com/johnhenry/temporals/issues/5.
  const start = Z("2026-01-01T09:00");
  const until = Z("2026-06-01T09:00");
  const ics = toICS([{ start, rrule: { start, freq: "weekly", until } }]);
  assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=\d{8}T\d{6}Z/);
  assert.doesNotMatch(ics, /UNTIL=[^\r\n]*\[/); // no [Time_Zone_ID] annotation on UNTIL
});

test("ICS round-trips a real external-tool-shaped UNTIL (bare UTC, no TZID brackets)", () => {
  // Simulates a .ics file produced by Google Calendar/Outlook/Apple Calendar:
  // DTSTART carries TZID, and RRULE's UNTIL is a bare UTC date-time.
  const externalIcs = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//temporals//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:x@example",
    "DTSTART;TZID=America/New_York:20260101T090000",
    "RRULE:FREQ=WEEKLY;UNTIL=20260601T130000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const [e] = fromICS(externalIcs);
  const rule = ruleFromString(e!.rrule as string, e!.start);
  const until = rule.until as unknown as Temporal.ZonedDateTime;
  assert.equal(until.toInstant().toString(), "2026-06-01T13:00:00Z");

  // DTSTART is a Thursday, so the last occurrence at/before the June 1
  // (Monday) UNTIL is the preceding Thursday, May 28.
  const out = icsToSeq({ ...e!, rrule: rule })
    .toArray()
    .map((z) => (z as Temporal.ZonedDateTime).toPlainDate().toString());
  assert.equal(out[0], "2026-01-01");
  assert.equal(out[out.length - 1], "2026-05-28");

  // Re-serialising stays RFC 5545 conformant and round-trips to the same text.
  assert.equal(formatRule(rule), "FREQ=WEEKLY;UNTIL=20260601T130000Z");
});
