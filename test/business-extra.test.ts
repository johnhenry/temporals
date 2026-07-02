import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { Interval, IntervalSet } from "../src/index.js";
import {
  BusinessCalendar,
  Holidays,
  easterHoliday,
  usFederalHolidays,
  WorkingHours,
  businessDuration,
  meetingSlots,
} from "../src/business.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);

test("easterHoliday: Easter, Good Friday, Easter Monday (2026)", () => {
  assert.equal(easterHoliday()(2026)!.toString(), "2026-04-05"); // Easter Sunday
  assert.equal(easterHoliday(-2)(2026)!.toString(), "2026-04-03"); // Good Friday
  assert.equal(easterHoliday(1)(2026)!.toString(), "2026-04-06"); // Easter Monday
});

test("usFederalHolidays: standard set with weekend observance", () => {
  const h = usFederalHolidays();
  assert.equal(h.has(D("2026-11-26")), true); // Thanksgiving
  assert.equal(h.has(D("2026-01-19")), true); // MLK
  assert.equal(h.has(D("2026-07-03")), true); // July 4 is a Saturday → observed Friday
  assert.equal(h.has(D("2026-07-04")), false); // actual day not the observed one
  assert.equal(h.inYear(2026).length, 11);
});

test("nthBusinessDay: payroll-style month positions", () => {
  const cal = new BusinessCalendar({ holidays: usFederalHolidays() });
  assert.equal(cal.nthBusinessDay(2026, 1, 3)!.toString(), "2026-01-06"); // Jan 1 holiday, then Jan 2, 5, 6
  assert.equal(cal.nthBusinessDay(2026, 1, -1)!.toString(), "2026-01-30"); // last business day
});

test("WorkingHours: overnight (cross-midnight) windows", () => {
  const wh = new WorkingHours({ windows: [["22:00", "06:00"]] });
  assert.equal(wh.isOpen(Z("2026-01-05T23:00")), true);
  assert.equal(wh.isOpen(Z("2026-01-06T02:00")), true); // window started the prior evening
  assert.equal(wh.isOpen(Z("2026-01-06T12:00")), false);
  assert.equal(businessDuration(Z("2026-01-05T23:00"), Z("2026-01-06T02:00"), wh).hours, 3);
});

test("meetingSlots: mutual availability across participants", () => {
  const hours = new WorkingHours({ windows: [["09:00", "17:00"]] });
  const within = new Interval(Z("2026-01-05T00:00"), Z("2026-01-06T00:00")); // a Monday
  const a = { hours, busy: IntervalSet.from([new Interval(Z("2026-01-05T10:00"), Z("2026-01-05T12:00"))]) };
  const b = { hours, busy: IntervalSet.from([new Interval(Z("2026-01-05T14:00"), Z("2026-01-05T15:00"))]) };

  const slots = meetingSlots({ participants: [a, b], within, duration: { minutes: 90 } });
  assert.deepEqual(
    slots.map((s) => `${s.start.toPlainTime().toString().slice(0, 5)}-${s.end.toPlainTime().toString().slice(0, 5)}`),
    ["12:00-14:00", "15:00-17:00"], // 09:00-10:00 (1h) too short for 90m
  );
});

test("meetingSlots: enriched output ranks trivially across time zones", () => {
  const hours = new WorkingHours({ windows: [["09:00", "17:00"]] }); // no calendar → every day
  const within = new Interval(Z("2026-01-05T00:00"), Z("2026-01-06T00:00")); // Monday, NY frame
  const ny = { hours, timeZone: "America/New_York" };
  const la = { hours, timeZone: "America/Los_Angeles" };

  const slots = meetingSlots({ participants: [ny, la], within, duration: { hours: 1 } });
  // NY 9–17 ∩ LA 9–17 (= NY 12–20) → common NY 12:00–17:00
  assert.equal(slots.length, 1);
  assert.equal(slots[0]!.start.toPlainTime().toString(), "12:00:00"); // NY frame
  // local starts per participant make ranking trivial
  assert.deepEqual(slots[0]!.localStarts.map((t) => t.toString().slice(0, 5)), ["12:00", "09:00"]);
  assert.equal(slots[0]!.earliestLocalHour, 9); // LA
  assert.equal(slots[0]!.latestLocalHour, 12); // NY
  // e.g. rank by "not too late for anyone": sort ascending by latestLocalHour
  const ranked = [...slots].sort((x, y) => x.latestLocalHour - y.latestLocalHour);
  assert.equal(ranked[0]!.latestLocalHour, 12);
});
