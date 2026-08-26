import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import {
  BusinessCalendar,
  Holidays,
  fixedHoliday,
  nthWeekdayHoliday,
  usFederalHolidays,
  WorkingHours,
  businessDuration,
} from "../src/business.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);

const holidays = Holidays.of(
  fixedHoliday(1, 1, { observed: true }), // New Year's Day
  nthWeekdayHoliday(11, "TH", 4), // Thanksgiving
);
const cal = new BusinessCalendar({ holidays });

test("Holidays: fixed and nth-weekday rules", () => {
  assert.equal(holidays.has(D("2026-01-01")), true);
  assert.equal(holidays.has(D("2026-11-26")), true); // 4th Thursday of Nov 2026
  assert.equal(holidays.has(D("2026-11-19")), false);
});

test("Holidays: observed shift that crosses the year boundary is still found by has()", () => {
  // Regression for https://github.com/johnhenry/temporals/issues/4 —
  // yearSet(year) was cached under the *input* year, but has(date) looked
  // it up under the *output* date's year, so a Jan 1 falling on a Saturday
  // (observed the prior Friday, Dec 31) was never found.
  const h = usFederalHolidays();
  // fixedHoliday(1, 1, { observed: true })(2028) === 2027-12-31
  assert.equal(fixedHoliday(1, 1, { observed: true })(2028)!.toString(), "2027-12-31");
  assert.equal(h.has(D("2027-12-31")), true); // New Year's Day 2028, observed
  assert.equal(h.has(D("2021-12-31")), true); // New Year's Day 2022, observed
  assert.equal(h.has(D("2032-12-31")), true); // New Year's Day 2033, observed
  // And the calendar treats that boundary date as non-business.
  const boundaryCal = new BusinessCalendar({ holidays: h });
  assert.equal(boundaryCal.isBusinessDay(D("2027-12-31")), false);
});

test("BusinessCalendar: weekends and holidays are not business days", () => {
  assert.equal(cal.isBusinessDay(D("2026-01-01")), false); // holiday
  assert.equal(cal.isBusinessDay(D("2026-01-03")), false); // Saturday
  assert.equal(cal.isBusinessDay(D("2026-01-02")), true); // Friday
});

test("BusinessCalendar: navigation and counting", () => {
  assert.equal(cal.nextBusinessDay(D("2026-01-01")).toString(), "2026-01-02");
  assert.equal(cal.previousBusinessDay(D("2026-01-05")).toString(), "2026-01-02");
  assert.equal(cal.addBusinessDays(D("2026-01-02"), 3).toString(), "2026-01-07");
  assert.equal(cal.businessDaysBetween(D("2026-01-01"), D("2026-01-08")), 4);
  assert.deepEqual(
    cal.businessDays({ start: D("2026-01-01"), end: D("2026-01-08") }).toArray().map(String),
    ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"],
  );
});

test("WorkingHours: isOpen and nextOpen", () => {
  const wh = new WorkingHours({ windows: [["09:00", "17:00"]], calendar: cal });
  assert.equal(wh.isOpen(Z("2026-01-02T10:00")), true);
  assert.equal(wh.isOpen(Z("2026-01-02T18:00")), false);
  assert.equal(wh.isOpen(Z("2026-01-01T10:00")), false); // holiday
  assert.equal(wh.nextOpen(Z("2026-01-02T07:00"))!.toPlainDateTime().toString(), "2026-01-02T09:00:00");
  assert.equal(wh.nextOpen(Z("2026-01-02T10:00"))!.toPlainDateTime().toString(), "2026-01-02T10:00:00");
  assert.equal(wh.nextOpen(Z("2026-01-02T18:00"))!.toPlainDateTime().toString(), "2026-01-05T09:00:00");
});

test("businessDuration counts only working time", () => {
  const wh = new WorkingHours({ windows: [["09:00", "17:00"]], calendar: cal });
  assert.equal(businessDuration(Z("2026-01-02T09:00"), Z("2026-01-02T17:00"), wh).hours, 8);
  // Fri 15:00 → Mon 11:00 skips the weekend: 2h Friday + 2h Monday
  assert.equal(businessDuration(Z("2026-01-02T15:00"), Z("2026-01-05T11:00"), wh).hours, 4);
});
