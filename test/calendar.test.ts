import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { startOf, endOf, quarterOf, fiscalQuarterOf, fiscalYearOf } from "../src/index.js";

const DT = (s: string) => Temporal.PlainDateTime.from(s);
const D = (s: string) => Temporal.PlainDate.from(s);

test("startOf: year / quarter / month / day / hour", () => {
  const t = DT("2026-05-17T13:45:30");
  assert.equal(startOf(t, "year").toString(), "2026-01-01T00:00:00");
  assert.equal(startOf(t, "quarter").toString(), "2026-04-01T00:00:00");
  assert.equal(startOf(t, "month").toString(), "2026-05-01T00:00:00");
  assert.equal(startOf(t, "day").toString(), "2026-05-17T00:00:00");
  assert.equal(startOf(t, "hour").toString(), "2026-05-17T13:00:00");
});

test("startOf: week honours weekStart", () => {
  assert.equal(startOf(D("2026-01-01"), "week").toString(), "2025-12-29"); // Monday
  assert.equal(startOf(D("2026-01-01"), "week", { weekStart: "SU" }).toString(), "2025-12-28");
});

test("endOf: exclusive upper bound (start of next unit)", () => {
  assert.equal(endOf(DT("2026-05-17T13:45:30"), "month").toString(), "2026-06-01T00:00:00");
  assert.equal(endOf(DT("2026-05-17T13:45:30"), "quarter").toString(), "2026-07-01T00:00:00");
});

test("startOf: ZonedDateTime day is DST-aware midnight", () => {
  const z = startOf(Temporal.ZonedDateTime.from("2026-03-08T13:00[America/New_York]"), "day");
  assert.equal(z.toPlainTime().toString(), "00:00:00");
  assert.equal(z.toPlainDate().toString(), "2026-03-08");
});

test("quarter and fiscal helpers", () => {
  assert.equal(quarterOf(D("2026-05-17")), 2);
  // fiscal year starting in October: Apr–Jun is fiscal Q3
  assert.equal(fiscalQuarterOf(D("2026-05-17"), 10), 3);
  assert.equal(fiscalQuarterOf(D("2026-10-01"), 10), 1);
  assert.equal(fiscalYearOf(D("2026-05-17"), 10), 2026);
  assert.equal(fiscalYearOf(D("2026-11-01"), 10), 2027);
});

import { isoWeekOf, dstSavingsNanoseconds } from "../src/index.js";

test("quarterOf / fiscal helpers refuse non-12-month calendars instead of answering wrongly", () => {
  const leapHebrew = Temporal.PlainDate.from({ year: 5784, monthCode: "M05", day: 1, calendar: "hebrew" });
  assert.equal(leapHebrew.monthsInYear, 13);
  assert.throws(() => quarterOf(leapHebrew), RangeError);
  assert.throws(() => fiscalQuarterOf(leapHebrew, 4), RangeError);
  assert.throws(() => fiscalYearOf(leapHebrew, 4), RangeError);
  assert.equal(quarterOf(D("2026-05-17")), 2);
});

test("isoWeekOf: ISO week number and week-year (year boundary)", () => {
  assert.deepEqual(isoWeekOf(D("2026-01-01")), { year: 2026, week: 1 });
  assert.deepEqual(isoWeekOf(D("2027-01-01")), { year: 2026, week: 53 });
  assert.deepEqual(isoWeekOf(D("2024-12-30")), { year: 2025, week: 1 });
  assert.deepEqual(isoWeekOf(DT("2026-05-17T13:45:30")), { year: 2026, week: 20 });
  const hebrew = Temporal.PlainDate.from("2026-05-17").withCalendar("hebrew");
  assert.throws(() => isoWeekOf(hebrew), RangeError);
});

test("dstSavingsNanoseconds: raw DST shift, caller decides what it means", () => {
  const H = 3_600_000_000_000;
  const z = (s: string) => Temporal.ZonedDateTime.from(s);
  assert.equal(dstSavingsNanoseconds(z("2026-07-01T12:00[America/New_York]")), H);
  assert.equal(dstSavingsNanoseconds(z("2026-01-01T12:00[America/New_York]")), 0);
  assert.equal(dstSavingsNanoseconds(z("2026-07-01T12:00[Asia/Tokyo]")), 0);
  // Southern hemisphere
  assert.equal(dstSavingsNanoseconds(z("2026-01-01T12:00[Australia/Sydney]")), H);
  // Negative-DST zone: Dublin summer (IST) is the larger offset, so by this definition it is "savings"
  assert.equal(dstSavingsNanoseconds(z("2026-07-01T12:00[Europe/Dublin]")), H);
});
