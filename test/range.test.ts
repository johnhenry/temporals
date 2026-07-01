import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { range } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);

test("range: half-open daily sequence excludes end", () => {
  const out = range({ start: D("2026-01-01"), end: D("2026-02-01"), step: { days: 1 } })
    .map((d) => d.toString())
    .toArray();
  assert.equal(out.length, 31);
  assert.equal(out[0], "2026-01-01");
  assert.equal(out.at(-1), "2026-01-31");
});

test("range: inclusive end includes a point landing on end", () => {
  const out = range({
    start: D("2026-01-01"),
    end: D("2026-02-01"),
    step: { days: 1 },
    inclusive: true,
  }).toArray();
  assert.equal(out.at(-1)!.toString(), "2026-02-01");
  assert.equal(out.length, 32);
});

test("range: count bound", () => {
  const out = range({ start: D("2026-01-01"), count: 5, step: { days: 2 } }).toArray();
  assert.deepEqual(
    out.map((d) => d.toString()),
    ["2026-01-01", "2026-01-03", "2026-01-05", "2026-01-07", "2026-01-09"],
  );
});

test("range: descending with negative step", () => {
  const out = range({ start: D("2026-01-05"), end: D("2026-01-01"), step: { days: -1 } })
    .map((d) => d.toString())
    .toArray();
  assert.deepEqual(out, ["2026-01-05", "2026-01-04", "2026-01-03", "2026-01-02"]);
});

test("range: infinite sequence is lazy and bounded by take", () => {
  const out = range({ start: D("2026-01-01"), step: { days: 1 } })
    .filter((d) => d.dayOfWeek <= 5) // weekdays
    .take(5)
    .map((d) => d.toString())
    .toArray();
  // 2026-01-01 is Thursday
  assert.deepEqual(out, [
    "2026-01-01",
    "2026-01-02",
    "2026-01-05",
    "2026-01-06",
    "2026-01-07",
  ]);
});

test("range: zero step without count throws", () => {
  assert.throws(
    () => range({ start: D("2026-01-01"), step: { days: 0 } }).toArray(),
    /step is zero/,
  );
});

test("range: zero step with count repeats the start", () => {
  const out = range({ start: D("2026-01-01"), step: { days: 0 }, count: 3 }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-01", "2026-01-01", "2026-01-01"]);
});

test("range: re-iterable (lazy factory, not single-shot)", () => {
  const seq = range({ start: D("2026-01-01"), count: 3, step: { days: 1 } });
  assert.equal(seq.toArray().length, 3);
  assert.equal(seq.toArray().length, 3);
});

test("range: month-end overflow constrains by default, rejects on demand", () => {
  const constrained = range({
    start: D("2026-01-31"),
    count: 3,
    step: { months: 1 },
  }).toArray();
  assert.deepEqual(constrained.map(String), ["2026-01-31", "2026-02-28", "2026-03-31"]);

  assert.throws(
    () =>
      range({ start: D("2026-01-31"), count: 3, step: { months: 1 }, overflow: "reject" }).toArray(),
    /./,
  );
});

test("range: ZonedDateTime keeps wall-clock across spring-forward DST", () => {
  const start = Temporal.ZonedDateTime.from("2026-03-07T12:00[America/New_York]");
  const out = range({ start, count: 3, step: { days: 1 } }).toArray();
  assert.deepEqual(
    out.map((z) => z.toPlainTime().toString()),
    ["12:00:00", "12:00:00", "12:00:00"],
  );
  // offsets shift -05:00 -> -04:00 when DST begins on 2026-03-08
  assert.equal(out[0]!.offset, "-05:00");
  assert.equal(out[1]!.offset, "-04:00");
  assert.equal(out[2]!.offset, "-04:00");
});

test("range: ZonedDateTime keeps wall-clock across fall-back DST", () => {
  const start = Temporal.ZonedDateTime.from("2026-10-31T12:00[America/New_York]");
  const out = range({ start, count: 3, step: { days: 1 } }).toArray();
  assert.deepEqual(
    out.map((z) => z.toPlainTime().toString()),
    ["12:00:00", "12:00:00", "12:00:00"],
  );
  assert.equal(out[0]!.offset, "-04:00");
  assert.equal(out[1]!.offset, "-05:00"); // 2026-11-01 fall back
});

test("range: works with PlainYearMonth", () => {
  const out = range({
    start: Temporal.PlainYearMonth.from("2026-01"),
    count: 4,
    step: { months: 1 },
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-01", "2026-02", "2026-03", "2026-04"]);
});

test("range: works with PlainTime", () => {
  const out = range({
    start: Temporal.PlainTime.from("09:00"),
    count: 3,
    step: { minutes: 30 },
  }).toArray();
  assert.deepEqual(out.map(String), ["09:00:00", "09:30:00", "10:00:00"]);
});
