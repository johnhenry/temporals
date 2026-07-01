import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { recur, recurFromString, formatRule } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const DT = (s: string) => Temporal.PlainDateTime.from(s);

test("byYearDay: first day of the year, yearly", () => {
  const out = recur({ start: D("2026-01-01"), freq: "yearly", byYearDay: [1], count: 2 }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-01", "2027-01-01"]);
});

test("byYearDay: negative (last day of the year)", () => {
  const out = recur({ start: D("2026-01-01"), freq: "yearly", byYearDay: [-1], count: 2 }).toArray();
  assert.deepEqual(out.map(String), ["2026-12-31", "2027-12-31"]);
});

test("byYearDay: 100th day, filtered by byMonth", () => {
  // day 100 of 2026 is Apr 10; restrict to April keeps it, restrict to Jan drops it
  const inApril = recur({
    start: D("2026-01-01"),
    freq: "yearly",
    byYearDay: [100],
    byMonth: [4],
    count: 1,
  }).toArray();
  assert.deepEqual(inApril.map(String), ["2026-04-10"]);
});

test("byWeekNo: Monday of ISO week 20, yearly", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "yearly",
    byWeekNo: [20],
    byWeekday: ["MO"],
    count: 2,
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-05-11", "2027-05-17"]);
});

test("byWeekNo: only valid with yearly", () => {
  assert.throws(
    () => recur({ start: D("2026-01-01"), freq: "monthly", byWeekNo: [1] }).toArray(),
    /BYWEEKNO is only valid with FREQ=YEARLY/,
  );
});

test("hourly: every 2 hours", () => {
  const out = recur({ start: DT("2026-01-01T00:00"), freq: "hourly", interval: 2, count: 4 }).toArray();
  assert.deepEqual(out.map(String), [
    "2026-01-01T00:00:00",
    "2026-01-01T02:00:00",
    "2026-01-01T04:00:00",
    "2026-01-01T06:00:00",
  ]);
});

test("minutely: every 30 min filtered to 9am (byHour) spans days", () => {
  const out = recur({
    start: DT("2026-01-01T09:00"),
    freq: "minutely",
    interval: 30,
    byHour: [9],
    count: 4,
  }).toArray();
  assert.deepEqual(out.map(String), [
    "2026-01-01T09:00:00",
    "2026-01-01T09:30:00",
    "2026-01-02T09:00:00",
    "2026-01-02T09:30:00",
  ]);
});

test("sub-daily on ZonedDateTime honours DST wall clock", () => {
  const start = Temporal.ZonedDateTime.from("2026-03-08T00:00[America/New_York]");
  // hourly across the spring-forward gap: 01:00 then 03:00 (02:00 does not exist)
  const out = recur({ start, freq: "hourly", count: 4 }).toArray();
  assert.deepEqual(
    out.map((z) => z.toPlainTime().toString()),
    ["00:00:00", "01:00:00", "03:00:00", "04:00:00"],
  );
});

test("sub-daily requires a time-bearing start", () => {
  assert.throws(
    () => recur({ start: D("2026-01-01"), freq: "hourly" }).toArray(),
    /time-bearing/,
  );
});

test("bySetPos with sub-daily throws", () => {
  assert.throws(
    () => recur({ start: DT("2026-01-01T00:00"), freq: "hourly", bySetPos: [1] }).toArray(),
    /BYSETPOS with sub-daily/,
  );
});

test("recurFromString: BYYEARDAY and HOURLY round-trip", () => {
  assert.deepEqual(
    [...recurFromString("FREQ=YEARLY;BYYEARDAY=-1;COUNT=2", D("2026-01-01"))].map(String),
    ["2026-12-31", "2027-12-31"],
  );
  assert.deepEqual(
    [...recurFromString("FREQ=HOURLY;INTERVAL=6;COUNT=3", DT("2026-01-01T00:00"))].map(String),
    ["2026-01-01T00:00:00", "2026-01-01T06:00:00", "2026-01-01T12:00:00"],
  );
});

test("formatRule: includes BYWEEKNO and BYYEARDAY", () => {
  assert.equal(
    formatRule({ start: D("2026-01-01"), freq: "yearly", byWeekNo: [20], byWeekday: ["MO"] }),
    "FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO",
  );
  assert.equal(
    formatRule({ start: D("2026-01-01"), freq: "yearly", byYearDay: [-1] }),
    "FREQ=YEARLY;BYYEARDAY=-1",
  );
});
