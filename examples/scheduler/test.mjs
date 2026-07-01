import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Scheduler } from "./scheduler.mjs";

test("scheduler fires a cron job on the second boundary and re-arms", async () => {
  const times = [];
  await new Promise((resolve, reject) => {
    const sched = new Scheduler({ onError: reject });
    sched.add(
      "beat",
      "*/1 * * * * *",
      (z) => {
        times.push(z.epochMilliseconds);
        if (times.length >= 2) {
          sched.stop();
          resolve();
        }
      },
      { timeZone: "UTC" },
    );
  });

  assert.equal(times.length, 2);
  assert.ok(times[0] % 1000 < 60 || times[0] % 1000 > 940, `not aligned: ${times[0] % 1000}`);
  const delta = times[1] - times[0];
  assert.ok(delta >= 900 && delta <= 1100, `delta=${delta}`);
});

test("duplicate job ids are rejected; removed jobs free the id", () => {
  const sched = new Scheduler({ now: () => globalThis.Temporal.Now.zonedDateTimeISO("UTC") });
  sched.add("a", "0 0 * * *", () => {}, { timeZone: "UTC" });
  assert.throws(() => sched.add("a", "0 0 * * *", () => {}, { timeZone: "UTC" }), /duplicate/);
  sched.remove("a");
  sched.add("a", "0 0 * * *", () => {}, { timeZone: "UTC" });
  sched.stop();
});
