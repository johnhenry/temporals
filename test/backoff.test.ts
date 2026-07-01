import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { backoff } from "../src/index.js";

const ms = (seq: Iterable<{ milliseconds: number }>) => [...seq].map((d) => d.milliseconds);

test("backoff: exponential by default", () => {
  assert.deepEqual(ms(backoff({ base: 100, attempts: 5 })), [100, 200, 400, 800, 1600]);
});

test("backoff: max caps each delay", () => {
  assert.deepEqual(ms(backoff({ base: 100, max: 500, attempts: 5 })), [100, 200, 400, 500, 500]);
});

test("backoff: factor 1 is constant", () => {
  assert.deepEqual(ms(backoff({ base: 1000, factor: 1, attempts: 3 })), [1000, 1000, 1000]);
});

test("backoff: jitter with injected RNG is deterministic", () => {
  assert.deepEqual(ms(backoff({ base: 100, attempts: 3, jitter: "full", random: () => 0.5 })), [50, 100, 200]);
  assert.deepEqual(ms(backoff({ base: 100, attempts: 2, jitter: "equal", random: () => 0 })), [50, 100]);
});

test("backoff: base as a duration-like", () => {
  assert.deepEqual(ms(backoff({ base: { seconds: 1 }, attempts: 2 })), [1000, 2000]);
});

test("backoff: infinite unless attempts is set", () => {
  assert.equal(backoff({ base: 100 }).take(4).toArray().length, 4);
});
