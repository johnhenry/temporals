import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { Schedule } from "../src/index.js";
import { cronSchedule } from "../src/cron-entry.js";

const TZ = "America/New_York";
const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[${TZ}]`);
const D = (s: string) => Temporal.PlainDate.from(s);

test("cronSchedule: next / nextN are strictly after `from`", () => {
  const s = cronSchedule("0 9 * * *", { timeZone: TZ });
  assert.equal(s.next(Z("2026-01-01T09:00"))!.toPlainDateTime().toString(), "2026-01-02T09:00:00");
  assert.deepEqual(
    s.nextN(Z("2026-01-01T00:00"), 2).map((z) => z.toPlainDate().toString()),
    ["2026-01-01", "2026-01-02"],
  );
});

test("Schedule.rule: unifies RRULE under the same interface", () => {
  const s = Schedule.rule({
    start: D("2026-01-01"),
    freq: "monthly",
    byWeekday: [{ weekday: "TU", nth: 2 }],
  });
  assert.deepEqual(
    s.nextN(D("2026-01-15"), 2).map(String),
    ["2026-02-10", "2026-03-10"],
  );
  assert.equal(s.next(D("2026-01-01"))!.toString(), "2026-01-13");
});

test("Schedule.range: unifies a stepped range", () => {
  const s = Schedule.range({ start: D("2026-01-01"), step: { days: 7 } });
  assert.deepEqual(
    s.between(D("2026-01-01"), D("2026-01-29")).map(String),
    ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"],
  );
});

test("Schedule.between: half-open by default, inclusive on request", () => {
  const s = Schedule.rule({ start: D("2026-01-01"), freq: "daily" });
  assert.equal(s.between(D("2026-01-01"), D("2026-01-04")).length, 3);
  assert.equal(s.between(D("2026-01-01"), D("2026-01-04"), { inclusiveEnd: true }).length, 4);
});

test("Schedule.of: custom occurrences function", () => {
  const s = Schedule.of<Temporal.PlainDate>((from) =>
    Schedule.range({ start: D("2026-01-01"), step: { days: 1 } }).occurrences(from),
  );
  assert.equal(s.nextN(D("2026-06-01"), 1)[0]!.toString(), "2026-06-02");
});
