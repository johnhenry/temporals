import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCron } from "../src/cron-entry.js";

// Regression snapshot: 5-field output must stay byte-identical.
const FIVE_FIELD: [string, string][] = [
  ["* * * * *", "every minute"],
    ["0 9 * * 1-5", "at 09:00, on Monday, Tuesday, Wednesday, Thursday, and Friday"],
  ["30 * * * *", "at 30 minutes past every hour"],
  ["0 0 1 1 *", "at 00:00, on day-of-month 1, in January"],
  ["0 0 L * *", "at 00:00, on the last day of the month"],
  ["0 9 * * 5#2", "at 09:00, on the second Friday"],
  ["0 0 * * 5L", "at 00:00, on the last Friday"],
  ["15 14 1 * *", "at 14:15, on day-of-month 1"],
  ["0,30 8,17 * * *", "at minute 0 and 30 of hours 8 and 17"],
    ["0 9 1,15 * 1", "at 09:00, on day-of-month 1 and 15 or on Monday (cron OR)"],
  ["0 0 LW * *", "at 00:00, on the last weekday of the month"],
  ["0 12 15W * *", "at 12:00, on the weekday nearest day 15"],
  ["5 4 * jan-mar mon", "at 04:05, on Monday, in January, February, and March"],
    ["0 9-17 * * *", "at minute 0 of hours 9, 10, 11, 12, 13, 14, 15, 16, and 17"],
];

test("describeCron: 5-field descriptions are unchanged (snapshot)", () => {
  for (const [expr, expected] of FIVE_FIELD) {
    assert.equal(describeCron(expr), expected, expr);
    assert.equal(describeCron(expr, false), expected, expr + " (seconds=false)");
  }
});

// 6-field (leading seconds) expressions: the seconds field must be described
// in every branch.
const SIX_FIELD: [string, string][] = [
  ["* * * * * *", "every second"],
  ["*/3 * * * * *", "every 3 seconds"],
  ["0,30 * * * * *", "at seconds 0, 30"],
  ["10-20 * * * * *", "every second from 10 through 20"],
  ["30 * * * * *", "at second 30 of every minute"],
  ["0 * * * * *", "every minute"],
  ["15 0 9 * * *", "at 09:00:15"],
  ["0 0 9 * * *", "at 09:00:00"],
  ["*/10 0 9 * * *", "every 10 seconds, at 09:00"],
  ["0,30 0 9 * * *", "at seconds 0, 30, at 09:00"],
  ["10-20 0 9 * * *", "every second from 10 through 20, at 09:00"],
  ["*/5 30 * * * *", "every 5 seconds, at 30 minutes past every hour"],
  ["*/3 * * * * 1-5", "every 3 seconds, on Monday, Tuesday, Wednesday, Thursday, and Friday"],
];

for (const [expr, expected] of SIX_FIELD) {
  test(`describeCron (6-field): ${expr}`, () => {
    assert.equal(describeCron(expr), expected);
    assert.equal(describeCron(expr, true), expected);
  });
}

// Step expressions (`*/n`, `a-b/n`, `a/n`) read as steps, not literal lists.
const STEPS: [string, string][] = [
  // minute
  ["*/5 * * * *", "every 5 minutes"],
  ["*/15 * * * *", "every 15 minutes"],
  ["1-30/10 * * * *", "every 10 minutes from minute 1 through 30 past the hour"],
  ["10/15 * * * *", "every 15 minutes from minute 10 through 59 past the hour"],
  ["0/15 * * * *", "every 15 minutes"],
  ["*/5 9-17 * * *", "every 5 minutes of hours 9, 10, 11, 12, 13, 14, 15, 16, and 17"],
  ["*/45 * * * *", "at minute 0 and 45 of every hour"], // 45 does not divide 60: not "every 45 minutes"
  // hour
  ["0 */2 * * *", "every 2 hours"],
  ["30 */2 * * *", "at minute 30 of every 2nd hour"],
  ["0 9-17/2 * * *", "every 2 hours from 9 through 17"],
  ["15 9-17/2 * * *", "at minute 15 of every 2nd hour from 9 through 17"],
  ["* */3 * * *", "every minute of every 3rd hour"],
  ["*/10 */6 * * *", "every 10 minutes of every 6th hour"],
  // day of month
  ["0 0 */2 * *", "at 00:00, on every 2nd day of the month"],
  ["0 0 1-15/7 * *", "at 00:00, on every 7th day of the month from 1 through 15"],
  // month
  ["0 0 1 */3 *", "at 00:00, on day-of-month 1, in every 3rd month"],
  ["0 0 1 1-9/4 *", "at 00:00, on day-of-month 1, in every 4th month from January through September"],
  // day of week (no natural step phrasing; stays a short list)
  ["0 0 * * */2", "at 00:00, on Sunday, Tuesday, Thursday, and Saturday"],
  ["0 0 * * 1-5/2", "at 00:00, on Monday, Wednesday, and Friday"],
  // seconds
  ["10-50/10 * * * * *", "every 10 seconds from 10 through 50"],
  ["*/5 */5 * * * *", "every 5 seconds, every 5 minutes"],
];

for (const [expr, expected] of STEPS) {
  test(`describeCron (steps): ${expr}`, () => {
    assert.equal(describeCron(expr), expected);
  });
}
