import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { cron, cronSchedule, describeCron, cronToRule, ruleToCron } from "../src/cron-entry.js";

const TZ = "America/New_York";
const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[${TZ}]`);
const wall = (z: Temporal.ZonedDateTime) => z.toPlainDateTime().toString();
const days = (expr: string, from: string, to: string) =>
  cronSchedule(expr, { timeZone: TZ }).between(Z(from), Z(to)).map((z) => z.day);

test("cron: weekdays at 09:00", () => {
  const out = cron("0 9 * * 1-5", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(4).toArray();
  assert.deepEqual(out.map(wall), [
    "2026-01-01T09:00:00",
    "2026-01-02T09:00:00",
    "2026-01-05T09:00:00",
    "2026-01-06T09:00:00",
  ]);
});

test("cron: */15 is clock-aligned, not anchored to `from`", () => {
  const out = cron("*/15 * * * *", { timeZone: TZ, from: Z("2026-01-01T00:07") }).take(4).toArray();
  assert.deepEqual(out.map(wall), [
    "2026-01-01T00:15:00",
    "2026-01-01T00:30:00",
    "2026-01-01T00:45:00",
    "2026-01-01T01:00:00",
  ]);
});

test("cron: DST spring-forward gap fires shifted forward by default, or skips", () => {
  assert.equal(
    cron("30 2 * * *", { timeZone: TZ, from: Z("2026-03-08T00:00") }).first()!.toString(),
    "2026-03-08T03:30:00-04:00[America/New_York]",
  );
  assert.equal(
    cron("30 2 * * *", { timeZone: TZ, from: Z("2026-03-08T00:00"), dstGap: "skip" }).first()!.toString(),
    "2026-03-09T02:30:00-04:00[America/New_York]",
  );
});

test("cron: DST fall-back overlap fires once (first offset default, second on request)", () => {
  assert.equal(
    cron("30 1 * * *", { timeZone: TZ, from: Z("2026-11-01T00:00") }).first()!.toString(),
    "2026-11-01T01:30:00-04:00[America/New_York]",
  );
  assert.equal(
    cron("30 1 * * *", { timeZone: TZ, from: Z("2026-11-01T00:00"), dstOverlap: "second" }).first()!.toString(),
    "2026-11-01T01:30:00-05:00[America/New_York]",
  );
});

test("cron: day-of-month / day-of-week OR quirk", () => {
  // midnight on the 13th OR any Monday (Vixie OR because both are restricted)
  assert.deepEqual(days("0 0 13 * 1", "2026-02-01T00:00", "2026-03-01T00:00"), [2, 9, 13, 16, 23]);
});

test("cron: sparse schedule (Feb 29) skips to the next leap year", () => {
  assert.equal(wall(cron("0 0 29 2 *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).first()!), "2028-02-29T00:00:00");
});

test("cron: 6-field expression parses a leading seconds field", () => {
  const out = cron("*/30 * * * * *", { timeZone: TZ, from: Z("2026-01-01T00:00:05") }).take(3).toArray();
  assert.deepEqual(out.map(wall), ["2026-01-01T00:00:30", "2026-01-01T00:01:00", "2026-01-01T00:01:30"]);
});

// --- Quartz special day rules -------------------------------------------------

test("cron: L = last day of month", () => {
  assert.deepEqual(days("0 0 L * *", "2026-01-01T00:00", "2026-04-01T00:00"), [31, 28, 31]);
});

test("cron: LW = last weekday of month", () => {
  const out = cronSchedule("0 0 LW * *", { timeZone: TZ })
    .between(Z("2026-01-01T00:00"), Z("2026-04-01T00:00"))
    .map(wall);
  assert.deepEqual(out, ["2026-01-30T00:00:00", "2026-02-27T00:00:00", "2026-03-31T00:00:00"]);
});

test("cron: nW = nearest weekday to a day (no month crossing)", () => {
  // 15th: Jan 15 is a Thursday (stays 15); Feb 15 is a Sunday -> Feb 16 (Mon)
  const out = cronSchedule("0 0 15W * *", { timeZone: TZ })
    .between(Z("2026-01-01T00:00"), Z("2026-03-01T00:00"))
    .map((z) => z.day);
  assert.deepEqual(out, [15, 16]);
});

test("cron: dL = last given weekday of month", () => {
  assert.deepEqual(days("0 0 * * 5L", "2026-01-01T00:00", "2026-03-01T00:00"), [30, 27]); // last Fridays
});

test("cron: d#n = nth given weekday of month", () => {
  assert.deepEqual(days("0 0 * * 5#2", "2026-01-01T00:00", "2026-03-01T00:00"), [9, 13]); // 2nd Fridays
});

test("cron: impossible schedule and bad input throw", () => {
  assert.throws(() => cron("0 0 30 2 *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).first(), /matches no valid date/);
  assert.throws(() => cron("0 9 * *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).first(), /cron fields/);
});

test("describeCron: readable output incl. specials", () => {
  assert.match(describeCron("0 9 * * 1-5"), /at 09:00/);
  assert.match(describeCron("0 9 * * 1-5"), /Monday.*Friday/);
  assert.match(describeCron("0 0 L * *"), /last day of the month/);
  assert.match(describeCron("0 9 * * 5#2"), /second Friday/);
  assert.match(describeCron("0 0 * * 5L"), /last Friday/);
});

test("cronToRule / ruleToCron: fixed-time round-trips", () => {
  const start = Temporal.PlainDate.from("2026-01-01");
  const rule = cronToRule("0 9 * * 1-5", start)!;
  assert.equal(rule.freq, "weekly");
  assert.deepEqual(rule.byWeekday, ["MO", "TU", "WE", "TH", "FR"]);
  assert.equal(ruleToCron(rule), "0 9 * * 1,2,3,4,5");
});

test("cronToRule / ruleToCron: Quartz L and #n map to RRULE nth/last", () => {
  const start = Temporal.PlainDate.from("2026-01-01");
  // last day of month
  assert.deepEqual(cronToRule("0 0 L * *", start)!.byMonthDay, [-1]);
  assert.equal(ruleToCron({ start, freq: "monthly", byMonthDay: [-1], byHour: [0], byMinute: [0] }), "0 0 L * *");
  // last Friday
  assert.deepEqual(cronToRule("0 9 * * 5L", start)!.byWeekday, [{ weekday: "FR", nth: -1 }]);
  assert.equal(ruleToCron({ start, freq: "monthly", byHour: [9], byWeekday: [{ weekday: "FR", nth: -1 }] }), "0 9 * * 5L");
  // 2nd Tuesday
  assert.equal(ruleToCron({ start, freq: "monthly", byHour: [0], byWeekday: [{ weekday: "TU", nth: 2 }] }), "0 0 * * 2#2");
});

test("converters return null on non-representable patterns", () => {
  const start = Temporal.PlainDate.from("2026-01-01");
  assert.equal(cronToRule("0 0 13 * 1", start), null); // OR semantics
  assert.equal(cronToRule("*/15 * * * *", start), null); // not a fixed time
  assert.equal(cronToRule("0 0 15W * *", start), null); // W not representable
  assert.equal(ruleToCron({ start, freq: "weekly", interval: 2, byHour: [9], byWeekday: ["MO"] }), null);
});
