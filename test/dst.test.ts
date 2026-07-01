import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { isDST, nextTransition, previousTransition, transitionsBetween } from "../src/index.js";

const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);

test("isDST: summer vs winter, and a no-DST zone", () => {
  assert.equal(isDST(Z("2026-07-01T12:00")), true);
  assert.equal(isDST(Z("2026-01-01T12:00")), false);
  assert.equal(isDST(Temporal.ZonedDateTime.from("2026-07-01T12:00[America/Phoenix]")), false);
});

test("next / previous transition", () => {
  assert.equal(nextTransition(Z("2026-01-15T12:00"))!.toPlainDate().toString(), "2026-03-08");
  assert.equal(previousTransition(Z("2026-01-15T12:00"))!.toPlainDate().toString(), "2025-11-02");
  assert.equal(nextTransition(Temporal.ZonedDateTime.from("2026-01-15T12:00[America/Phoenix]")), null);
});

test("transitionsBetween lists offset changes in a range", () => {
  const ts = transitionsBetween(Z("2026-01-01T00:00"), Z("2027-01-01T00:00"));
  assert.deepEqual(
    ts.map((t) => t.toPlainDate().toString()),
    ["2026-03-08", "2026-11-01"],
  );
});
