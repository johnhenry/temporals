import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { Temporal as TemporalFull } from "temporal-polyfill/full";
import { recur } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);
const strs = (it: Iterable<{ toString(): string }>) => [...it].map((x) => x.toString());

test("EXDATE: exclude removes matching occurrences (count is post-exclusion)", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "daily",
    count: 4,
    exclude: [D("2026-01-02"), D("2026-01-03")],
  }).toArray();
  // count counts returned occurrences: Jan 2 & 3 skipped, 4 real ones returned
  assert.deepEqual(out.map(String), ["2026-01-01", "2026-01-04", "2026-01-05", "2026-01-06"]);
});

test("RDATE: include merges extra dates in sorted order (deduped)", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "weekly", // Thursdays
    count: 4,
    include: [D("2026-01-03"), D("2026-01-08")],
  }).toArray();
  // rule: Jan 1, 8, 15, 22 (Thursdays); + RDATE Jan 3, Jan 8(dup) → merged
  assert.deepEqual(out.map(String), ["2026-01-01", "2026-01-03", "2026-01-08", "2026-01-15"]);
});

test("EXDATE + RDATE together", () => {
  const out = recur({
    start: D("2026-01-01"),
    freq: "daily",
    count: 3,
    include: [D("2026-06-15")],
    exclude: [D("2026-01-02")],
  }).toArray();
  assert.deepEqual(out.map(String), ["2026-01-01", "2026-01-03", "2026-01-04"]);
});

test("DST parity: zoned daily across a spring-forward gap (fire vs skip)", () => {
  const start = Z("2026-03-07T02:30");
  const fire = recur({ start, freq: "daily", count: 3 }).toArray();
  assert.deepEqual(fire.map((z) => z.toPlainTime().toString()), ["02:30:00", "03:30:00", "02:30:00"]);

  const skip = recur({ start, freq: "daily", count: 3, dstGap: "skip" }).toArray();
  assert.deepEqual(skip.map((z) => z.toPlainDate().toString()), ["2026-03-07", "2026-03-09", "2026-03-10"]);
});

test("DST parity: zoned overlap first vs second offset", () => {
  const start = Z("2026-11-01T01:30");
  assert.equal(recur({ start, freq: "daily", count: 1 })[Symbol.iterator]().next().value!.offset, "-04:00");
  assert.equal(
    recur({ start, freq: "daily", count: 1, dstOverlap: "second" }).toArray()[0]!.offset,
    "-05:00",
  );
});

test("calendar-safe: Hebrew monthly steps through a 13-month leap year", () => {
  const start = TemporalFull.PlainDate.from("2023-09-16").withCalendar("hebrew").with({ day: 1 });
  const out = strs(recur({ start, freq: "monthly", count: 14 }));
  assert.deepEqual(out, [
    "2023-09-16[u-ca=hebrew]", "2023-10-16[u-ca=hebrew]", "2023-11-14[u-ca=hebrew]",
    "2023-12-13[u-ca=hebrew]", "2024-01-11[u-ca=hebrew]", "2024-02-10[u-ca=hebrew]",
    "2024-03-11[u-ca=hebrew]", "2024-04-09[u-ca=hebrew]", "2024-05-09[u-ca=hebrew]",
    "2024-06-07[u-ca=hebrew]", "2024-07-07[u-ca=hebrew]", "2024-08-05[u-ca=hebrew]",
    "2024-09-04[u-ca=hebrew]", "2024-10-03[u-ca=hebrew]",
  ]);
  // month numbers reach 13 (would break under year*12 math)
  assert.equal(TemporalFull.PlainDate.from(out[12]!).month, 13);
});

test("impossible rules now throw instead of silently stopping", () => {
  assert.throws(
    () => recur({ start: D("2026-01-01"), freq: "monthly", byMonth: [2], byMonthDay: [31] }).first(),
    /no occurrences/,
  );
});
