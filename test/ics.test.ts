import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { toICS, fromICS, icsToSeq } from "../src/ics.js";

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
