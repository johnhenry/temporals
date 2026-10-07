import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCron } from "../src/cron-entry.js";

// Regression snapshot: 5-field output must stay byte-identical.
const FIVE_FIELD: [string, string][] = [
  ["* * * * *", "every minute"],
  ["*/5 * * * *", "at minute 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, and 55 of every hour"],
  ["0 9 * * 1-5", "at 09:00, on Monday, Tuesday, Wednesday, Thursday, and Friday"],
  ["30 * * * *", "at 30 minutes past every hour"],
  ["0 0 1 1 *", "at 00:00, on day-of-month 1, in January"],
  ["0 0 L * *", "at 00:00, on the last day of the month"],
  ["0 9 * * 5#2", "at 09:00, on the second Friday"],
  ["0 0 * * 5L", "at 00:00, on the last Friday"],
  ["15 14 1 * *", "at 14:15, on day-of-month 1"],
  ["0,30 8,17 * * *", "at minute 0 and 30 of hours 8 and 17"],
  ["*/15 * * * *", "at minute 0, 15, 30, and 45 of every hour"],
  ["0 9 1,15 * 1", "at 09:00, on day-of-month 1 and 15 or on Monday (cron OR)"],
  ["0 0 LW * *", "at 00:00, on the last weekday of the month"],
  ["0 12 15W * *", "at 12:00, on the weekday nearest day 15"],
  ["5 4 * jan-mar mon", "at 04:05, on Monday, in January, February, and March"],
  ["0 */2 * * *", "at minute 0 of hours 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, and 22"],
  ["0 9-17 * * *", "at minute 0 of hours 9, 10, 11, 12, 13, 14, 15, 16, and 17"],
];

test("describeCron: 5-field descriptions are unchanged (snapshot)", () => {
  for (const [expr, expected] of FIVE_FIELD) {
    assert.equal(describeCron(expr), expected, expr);
    assert.equal(describeCron(expr, false), expected, expr + " (seconds=false)");
  }
});
