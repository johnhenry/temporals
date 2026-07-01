import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { Seq, Interval, IntervalSet, chunks, windows, recur, configureTemporal, getTemporal } from "../src/index.js";
import { describeCron, cronToRule, ruleToCron } from "../src/cron-entry.js";
import { humanizeDuration, formatRelative } from "../src/humanize.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const DT = (s: string) => Temporal.PlainDateTime.from(s);

test("temporal resolver: configure + get", () => {
  configureTemporal(Temporal);
  assert.equal(getTemporal(), Temporal);
});

test("Seq: statics and edge terminals", () => {
  assert.deepEqual(Seq.empty<number>().toArray(), []);
  assert.deepEqual(Seq.of(1, 2, 3).concat([4, 5]).toArray(), [1, 2, 3, 4, 5]);
  const tapped: number[] = [];
  assert.deepEqual(Seq.of(1, 2).tap((x) => tapped.push(x)).toArray(), [1, 2]);
  assert.deepEqual(tapped, [1, 2]);
  assert.equal(Seq.of(1, 2, 3).at(-1), undefined);
  assert.equal(Seq.of(1, 2, 3).at(99), undefined);
  assert.equal(Seq.empty<number>().first(), undefined);
  assert.equal(Seq.of(1, 2, 3).find((x) => x > 9), undefined);
  assert.equal(Seq.of(1, 2, 3).some((x) => x > 9), false);
  assert.equal(Seq.of(1, 2, 3).every((x) => x > 9), false);
  assert.deepEqual(Seq.of(1, 2, 3, 4).dropWhile((x) => x < 3).toArray(), [3, 4]);
  assert.deepEqual(Seq.of(1).pairwise().toArray(), []);
});

test("IntervalSet: empty, plain-array union, contains/encloses/abuts", () => {
  const empty = IntervalSet.empty<Temporal.PlainDate>();
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.totalDuration().toString(), "PT0S");
  const a = IntervalSet.from([new Interval(D("2026-01-01"), D("2026-01-05"))]);
  assert.equal(a.union([new Interval(D("2026-01-05"), D("2026-01-08"))]).intervals.length, 1); // abutting → merged
  assert.equal(a.contains(D("2026-01-10")), false);
  assert.equal(new Interval(D("2026-01-01"), D("2026-01-05")).encloses(new Interval(D("2026-01-02"), D("2026-01-03"))), true);
  assert.equal(new Interval(D("2026-01-01"), D("2026-01-05")).abuts(new Interval(D("2026-01-05"), D("2026-01-06"))), true);
});

test("chunks/windows: partial flags", () => {
  // drop trailing partial chunk
  assert.equal(chunks({ start: D("2026-01-01"), end: D("2026-01-10"), by: { weeks: 1 }, partial: false }).toArray().length, 1);
  // emit trailing partial window
  const w = windows({ start: D("2026-01-01"), end: D("2026-01-05"), size: { days: 7 }, step: { days: 1 }, partial: true }).toArray();
  assert.ok(w.length >= 1);
  assert.throws(() => chunks({ start: D("2026-01-01"), end: D("2026-01-10"), by: { days: 0 } }).first(), /positive/);
});

test("humanize: zero, negative, single-unit, relative equal", () => {
  assert.equal(humanizeDuration(Temporal.Duration.from({ seconds: 0 })), "0 seconds");
  assert.equal(humanizeDuration(Temporal.Duration.from({ seconds: 0 }), { short: true }), "0s");
  assert.equal(humanizeDuration(Temporal.Duration.from({ days: 1 })), "1 day"); // singular
  assert.match(formatRelative(D("2026-01-01"), D("2026-01-01")), /now|second/); // zero difference
});

test("cron converters: null cases and Quartz emission", () => {
  const start = D("2026-01-01");
  assert.equal(cronToRule("30 * * * *", start), null); // hour wildcard
  assert.equal(ruleToCron({ start, freq: "monthly", byHour: [9], bySetPos: [1] }), null); // bySetPos
  assert.equal(ruleToCron({ start, freq: "hourly", byHour: [9] }), null); // sub-daily
  assert.equal(ruleToCron({ start, freq: "monthly", byHour: [0], byMonthDay: [-2] }), "0 0 L-1 * *"); // negative month-day
  assert.match(describeCron("* * * * *"), /every minute/);
  assert.match(describeCron("0 0 1 1 *"), /January/);
});

test("recur: datetime byHour expansion (applyTimes path)", () => {
  const out = recur({ start: DT("2026-01-01T00:00"), freq: "daily", byHour: [9, 17], count: 4 }).toArray();
  assert.deepEqual(out.map(String), [
    "2026-01-01T09:00:00",
    "2026-01-01T17:00:00",
    "2026-01-02T09:00:00",
    "2026-01-02T17:00:00",
  ]);
});
