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
