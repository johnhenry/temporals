import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { humanizeDuration, formatRelative, fromNow, parseDuration } from "../src/humanize.js";

const Dur = (d: object) => Temporal.Duration.from(d);
const D = (s: string) => Temporal.PlainDate.from(s);
const DT = (s: string) => Temporal.PlainDateTime.from(s);

test("humanizeDuration: long, short, and max forms", () => {
  assert.equal(humanizeDuration(Dur({ hours: 2, minutes: 3 })), "2 hours, 3 minutes");
  assert.equal(humanizeDuration(Dur({ days: 1 })), "1 day");
  assert.equal(humanizeDuration(Dur({ hours: 2, minutes: 3 }), { short: true }), "2h 3m");
  assert.equal(
    humanizeDuration(Dur({ hours: 2, minutes: 3, seconds: 4 }), { max: 2 }),
    "2 hours, 3 minutes",
  );
  assert.equal(humanizeDuration(Dur({ seconds: 0 })), "0 seconds");
});

test("parseDuration: shorthand to Temporal.Duration", () => {
  const d = parseDuration("1h30m");
  assert.equal(d.hours, 1);
  assert.equal(d.minutes, 30);
  assert.equal(parseDuration("2d").days, 2);
  assert.equal(parseDuration("1h 30m 15s").seconds, 15);
  assert.throws(() => parseDuration("nonsense"), /could not parse/);
});

test("formatRelative: future and past", () => {
  assert.equal(formatRelative(D("2026-01-01"), D("2026-01-06")), "in 5 days");
  assert.equal(formatRelative(D("2026-01-06"), D("2026-01-01")), "5 days ago");
  assert.equal(formatRelative(DT("2026-01-01T10:00"), DT("2026-01-01T12:00")), "in 2 hours");
});

test("fromNow returns a string", () => {
  assert.equal(typeof fromNow(D("2030-01-01")), "string");
});

test("humanizeDuration: locale option localizes when Intl.DurationFormat exists, else falls back", () => {
  const out = humanizeDuration(Dur({ hours: 2, minutes: 3 }), { locale: "fr" });
  const hasDF = typeof (Intl as unknown as { DurationFormat?: unknown }).DurationFormat === "function";
  if (hasDF) {
    assert.ok(out.length > 0); // localized (e.g. "2 heures, 3 minutes")
  } else {
    assert.equal(out, "2 hours, 3 minutes"); // graceful English fallback
  }
});

const Z = (s: string) => Temporal.ZonedDateTime.from(s);

test("formatRelative: 'tomorrow' only for the next calendar day", () => {
  const now = Z("2026-03-10T10:00:00-07:00[America/Los_Angeles]");
  assert.equal(formatRelative(now, now.add({ hours: 47 })), "in 2 days");
  assert.equal(formatRelative(now, now.add({ hours: 24 })), "tomorrow");
  assert.equal(formatRelative(now, now.add({ hours: 47 }), { numeric: "always" }), "in 2 days");
  // 47 h spanning two dates, from late evening
  const late = Z("2026-03-10T23:00:00-07:00[America/Los_Angeles]");
  assert.equal(formatRelative(late, late.add({ hours: 47 })), "in 2 days");
  assert.equal(formatRelative(late.add({ hours: 47 }), late), "2 days ago");
  assert.equal(formatRelative(now.add({ hours: 24 }), now), "yesterday");
  assert.equal(formatRelative(now.add({ hours: 47 }), now), "2 days ago");
});

test("formatRelative: calendar days are counted in the target time zone", () => {
  // 2026-11-01 is the 25-hour fall-back day in Los Angeles.
  const a = Z("2026-10-31T12:00:00-07:00[America/Los_Angeles]");
  assert.equal(formatRelative(a, Z("2026-11-01T12:00:00-08:00[America/Los_Angeles]")), "tomorrow");
  // Same instant gap, wall dates two apart in the target zone
  const from = Z("2026-06-01T20:00:00-07:00[America/Los_Angeles]");
  const to = from.add({ hours: 30 }); // 2026-06-03T02:00 local
  assert.equal(formatRelative(from, to), "in 2 days");
});

test("formatRelative: PlainDateTime uses calendar days too", () => {
  assert.equal(formatRelative(DT("2026-01-01T10:00"), DT("2026-01-03T09:00")), "in 2 days");
  assert.equal(formatRelative(DT("2026-01-01T10:00"), DT("2026-01-02T10:00")), "tomorrow");
  assert.equal(formatRelative(DT("2026-01-01T23:00"), DT("2026-01-02T01:00")), "in 2 hours");
});
