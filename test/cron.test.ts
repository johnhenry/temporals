import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { cron, describeCron, cronToRule, ruleToCron, Schedule } from "../src/index.js";

const TZ = "America/New_York";
const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[${TZ}]`);
const wall = (z: Temporal.ZonedDateTime) => z.toPlainDateTime().toString();

test("cron: weekdays at 09:00", () => {
  const out = cron("0 9 * * 1-5", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(4).toArray();
  // 2026-01-01 is a Thursday
  assert.deepEqual(out.map(wall), [
    "2026-01-01T09:00:00",
    "2026-01-02T09:00:00",
    "2026-01-05T09:00:00",
    "2026-01-06T09:00:00",
  ]);
});

test("cron: */15 is clock-aligned (:00 :15 :30 :45), not anchored to `from`", () => {
  const out = cron("*/15 * * * *", { timeZone: TZ, from: Z("2026-01-01T00:07") }).take(4).toArray();
  assert.deepEqual(out.map(wall), [
    "2026-01-01T00:15:00",
    "2026-01-01T00:30:00",
    "2026-01-01T00:45:00",
    "2026-01-01T01:00:00",
  ]);
});

test("cron: DST spring-forward gap fires shifted forward by default", () => {
  const out = cron("30 2 * * *", { timeZone: TZ, from: Z("2026-03-08T00:00") }).take(1).toArray();
  // 02:30 does not exist on 2026-03-08; default policy fires at 03:30 (-04:00)
  assert.equal(out[0]!.toString(), "2026-03-08T03:30:00-04:00[America/New_York]");
});

test("cron: DST gap can be skipped", () => {
  const out = cron("30 2 * * *", {
    timeZone: TZ,
    from: Z("2026-03-08T00:00"),
    dstGap: "skip",
  }).take(1).toArray();
  // skipped on the 8th; next real 02:30 is the 9th
  assert.equal(out[0]!.toString(), "2026-03-09T02:30:00-04:00[America/New_York]");
});

test("cron: DST fall-back overlap fires once at the first offset by default", () => {
  const first = cron("30 1 * * *", { timeZone: TZ, from: Z("2026-11-01T00:00") }).take(1).toArray();
  assert.equal(first[0]!.toString(), "2026-11-01T01:30:00-04:00[America/New_York]");

  const second = cron("30 1 * * *", {
    timeZone: TZ,
    from: Z("2026-11-01T00:00"),
    dstOverlap: "second",
  }).take(1).toArray();
  assert.equal(second[0]!.toString(), "2026-11-01T01:30:00-05:00[America/New_York]");
});

test("cron: day-of-month / day-of-week OR quirk", () => {
  // midnight on the 13th OR any Monday (Vixie OR because both are restricted)
  const days = Schedule.cron("0 0 13 * 1", { timeZone: TZ })
    .between(Z("2026-02-01T00:00"), Z("2026-03-01T00:00"))
    .map((z) => z.day);
  // Feb 2026: Mondays 2,9,16,23 plus the 13th (a Friday)
  assert.deepEqual(days, [2, 9, 13, 16, 23]);
});

test("cron: sparse schedule (Feb 29) skips to the next leap year", () => {
  const out = cron("0 0 29 2 *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(1).toArray();
  assert.equal(wall(out[0]!), "2028-02-29T00:00:00");
});

test("cron: 6-field expression parses a leading seconds field", () => {
  const out = cron("*/30 * * * * *", { timeZone: TZ, from: Z("2026-01-01T00:00:05") }).take(3).toArray();
  assert.deepEqual(out.map(wall), [
    "2026-01-01T00:00:30",
    "2026-01-01T00:01:00",
    "2026-01-01T00:01:30",
  ]);
});

test("cron: @daily macro", () => {
  const out = cron("@daily", { timeZone: TZ, from: Z("2026-01-01T12:00") }).take(2).toArray();
  assert.deepEqual(out.map(wall), ["2026-01-02T00:00:00", "2026-01-03T00:00:00"]);
});

test("cron: impossible schedule throws", () => {
  assert.throws(
    () => cron("0 0 30 2 *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(1).toArray(),
    /matches no valid date/,
  );
});

test("cron: wrong field count and unsupported chars throw", () => {
  assert.throws(() => cron("0 9 * *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).first(), /cron fields/);
  assert.throws(
    () => cron("0 0 L * *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).first(),
    /L\/W\/#/,
  );
});

test("describeCron: readable output for common patterns", () => {
  assert.match(describeCron("0 9 * * 1-5"), /at 09:00/);
  assert.match(describeCron("0 9 * * 1-5"), /Monday.*Friday/);
  assert.match(describeCron("0 0 1 1 *"), /at 00:00/);
  assert.match(describeCron("0 0 1 1 *"), /January/);
});

test("cronToRule / ruleToCron: fixed-time conversion round-trips", () => {
  const start = Temporal.PlainDate.from("2026-01-01");
  const rule = cronToRule("0 9 * * 1-5", start)!;
  assert.equal(rule.freq, "weekly");
  assert.deepEqual(rule.byWeekday, ["MO", "TU", "WE", "TH", "FR"]);
  assert.deepEqual(rule.byHour, [9]);
  assert.deepEqual(rule.byMinute, [0]);
  assert.equal(ruleToCron(rule), "0 9 * * 1,2,3,4,5");
});

test("converters return null on non-representable patterns", () => {
  const start = Temporal.PlainDate.from("2026-01-01");
  assert.equal(cronToRule("0 0 13 * 1", start), null); // OR semantics
  assert.equal(cronToRule("*/15 * * * *", start), null); // not a fixed time
  assert.equal(ruleToCron({ start, freq: "weekly", interval: 2, byHour: [9], byWeekday: ["MO"] }), null);
  assert.equal(
    ruleToCron({ start, freq: "monthly", byHour: [9], byWeekday: [{ weekday: "FR", nth: -1 }] }),
    null,
  );
});
