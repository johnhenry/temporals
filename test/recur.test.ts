import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { recur, recurFromString, ruleFromString, formatRule, recurBuilder } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const strs = (it: Iterable<{ toString(): string }>) => [...it].map((x) => x.toString());

test("recur: 2nd Tuesday of each month", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "monthly",
    byWeekday: [{ weekday: "TU", nth: 2 }],
    count: 3,
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-13", "2026-02-10", "2026-03-10"]);
});

test("recur: last weekday of each month via bySetPos -1", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "monthly",
    byWeekday: ["MO", "TU", "WE", "TH", "FR"],
    bySetPos: [-1],
    count: 3,
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-30", "2026-02-27", "2026-03-31"]);
});

test("recur: biweekly on Monday and Wednesday", () => {
  const out = recur({
    start: D("2026-01-05"), // a Monday
    freq: "weekly",
    interval: 2,
    byWeekday: ["MO", "WE"],
    count: 4,
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-05", "2026-01-07", "2026-01-19", "2026-01-21"]);
});

test("recur: simple daily with count", () => {
  const out = recur({ start: D("2026-01-01"), freq: "daily", count: 3 }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-01", "2026-01-02", "2026-01-03"]);
});

test("recur: monthly on the same day-of-month skips months lacking that day", () => {
  const out = recur({
    start: D("2026-01-31"),
    freq: "monthly",
    count: 3,
  }).toArray();
  // February has no 31st, so it is skipped
  assert.deepEqual(out.map(String), ["2026-01-31", "2026-03-31", "2026-05-31"]);
});

test("recur: byMonthDay with negative day (last day of month)", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "monthly",
    byMonthDay: [-1],
    count: 3,
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("recur: until bound is inclusive", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "daily",
    interval: 1,
    until: D("2026-01-03"),
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-01", "2026-01-02", "2026-01-03"]);
});

test("recur: first instance respects start (occurrences before start are skipped)", () => {
  const out = recur({
    start: D("2026-01-20"),
    freq: "monthly",
    byMonthDay: [15],
    count: 2,
  }).toArray();
  // Jan 15 is before start -> first emitted is Feb 15
  assert.deepEqual(out.map(String), ["2026-02-15", "2026-03-15"]);
});

test("recur: yearly anniversary (Feb 29 only in leap years)", () => {
  const out = recur({ start: D("2024-02-29"), freq: "yearly", count: 2 }).toArray();
  // 2025-2027 are not leap; next is 2028
  assert.deepEqual(out.map(String), ["2024-02-29", "2028-02-29"]);
});

test("recur: yearly with byMonth + nth weekday ('2nd Sunday in March')", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "yearly",
    byMonth: [3],
    byWeekday: [{ weekday: "SU", nth: 2 }],
    count: 2,
  }).toArray();
  // US DST start dates: 2026-03-08, 2027-03-14
  assert.deepEqual(out.map(String), ["2026-03-08", "2027-03-14"]);
});

test("recur: works on ZonedDateTime, preserving wall-clock time", () => {
  const start = Temporal.ZonedDateTime.from("2026-01-01T09:30[America/New_York]");
  const out = recur({
    start,
    freq: "monthly",
    byWeekday: [{ weekday: "TU", nth: 2 }],
    count: 2,
  }).toArray();
  assert.deepEqual(out.map((z) => z.toPlainDate().toString()), ["2026-01-13", "2026-02-10"]);
  assert.equal(out[0]!.toPlainTime().toString(), "09:30:00");
});

test("recurFromString: round-trips a canonical RRULE", () => {
  const out = strs(recurFromString("FREQ=MONTHLY;BYDAY=2TU;COUNT=3", D("2026-01-01")));
  assert.deepEqual(out, ["2026-01-13", "2026-02-10", "2026-03-10"]);
});

test("formatRule: serialises back to an RRULE string", () => {
  const s = formatRule({
    start: D("2026-01-01"),
    freq: "monthly",
    interval: 2,
    byWeekday: [{ weekday: "FR", nth: -1 }],
    count: 5,
  });
  assert.equal(s, "FREQ=MONTHLY;INTERVAL=2;COUNT=5;BYDAY=-1FR");
});

test("formatRule: UNTIL for a ZonedDateTime rule is RFC 5545 UTC form, not an extended zoned string", () => {
  // Regression for https://github.com/johnhenry/temporals/issues/5 — UNTIL
  // must be a bare UTC date-time (YYYYMMDDTHHMMSSZ) when DTSTART carries a
  // time zone; the old code emitted Temporal's extended `[Time_Zone_ID]`
  // form, which real calendar clients reject.
  const start = Temporal.ZonedDateTime.from("2026-01-01T09:00:00-05:00[America/New_York]");
  const until = Temporal.ZonedDateTime.from("2026-06-01T09:00:00-04:00[America/New_York]");
  const s = formatRule({ start, freq: "weekly", until });
  assert.match(s, /UNTIL=\d{8}T\d{6}Z/);
  assert.doesNotMatch(s, /\[.*\]/); // no [Time_Zone_ID] annotation
  assert.equal(s, "FREQ=WEEKLY;UNTIL=20260601T130000Z");
});

test("ruleFromString: round-trips a real (non-bracketed) UTC UNTIL for a zoned DTSTART", () => {
  // The RRULE an external tool (Google Calendar, etc.) would actually emit:
  // a bare UTC UNTIL with no [Time_Zone_ID] annotation. ruleFromString must
  // parse it (ZonedDateTime.from would reject a bracket-less string), and
  // re-serialising via formatRule must round-trip to the same UTC form.
  const start = Temporal.ZonedDateTime.from("2026-01-01T09:00:00-05:00[America/New_York]");
  const rule = ruleFromString("FREQ=WEEKLY;UNTIL=20260601T130000Z", start);
  assert.equal(rule.until?.toInstant().toString(), "2026-06-01T13:00:00Z");
  assert.equal(rule.until?.timeZoneId, "America/New_York");
  assert.equal(formatRule(rule), "FREQ=WEEKLY;UNTIL=20260601T130000Z");

  // And the resulting sequence stops at the right wall-clock instant. DTSTART
  // is a Thursday, so the last occurrence at/before the June 1 (Monday)
  // UNTIL is the preceding Thursday, May 28.
  const out = recur(rule)
    .toArray()
    .map((z) => z.toPlainDate().toString());
  assert.equal(out[0], "2026-01-01");
  assert.equal(out[out.length - 1], "2026-05-28");
});

test("recurBuilder: fluent API matches the rule object", () => {
  const out = recurBuilder(D("2026-01-01"))
    .monthly()
    .on({ weekday: "TU", nth: 2 })
    .count(3)
    .toArray();
  assert.deepEqual(out.map(String), ["2026-01-13", "2026-02-10", "2026-03-10"]);
});

test("recur: invalid rules throw clearly", () => {
  // date frequency on a non-date-bearing start
  assert.throws(
    () => recur({ start: Temporal.PlainTime.from("09:00") as never, freq: "daily" }).toArray(),
    /date-bearing/,
  );
  // non-positive interval
  assert.throws(
    () => recur({ start: D("2026-01-01"), freq: "daily", interval: 0 }).toArray(),
    /positive integer/,
  );
});
