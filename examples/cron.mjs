// temporals/cron — Temporal-native cron with DST + Quartz specials.
//   node examples/cron.mjs
import "temporal-polyfill/global";
import { cron, cronSchedule, describeCron, parseCron, cronToRule, ruleToCron } from "temporals/cron";

const TZ = "America/New_York";
const Z = (s) => Temporal.ZonedDateTime.from(`${s}[${TZ}]`);
const show = (label, it) => console.log(label, [...it].map((z) => z.toString()).join(", "));

show("weekdays 9am:", cron("0 9 * * 1-5", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(3));
show("*/15 (clock-aligned):", cron("*/15 * * * *", { timeZone: TZ, from: Z("2026-01-01T00:07") }).take(3));

// DST: 2:30 doesn't exist on spring-forward day → fired at 3:30 by default.
show("DST gap (default fire):", cron("30 2 * * *", { timeZone: TZ, from: Z("2026-03-08T00:00") }).take(1));

// Quartz special day rules.
show("last weekday of month (LW):", cron("0 0 LW * *", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(2));
show("2nd Friday (5#2):", cron("0 0 * * 5#2", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(2));
show("last Friday (5L):", cron("0 0 * * 5L", { timeZone: TZ, from: Z("2026-01-01T00:00") }).take(2));

console.log("describeCron:", describeCron("0 9 * * 1-5"));
console.log("cronSchedule.next:", cronSchedule("0 9 * * *", { timeZone: TZ }).next(Z("2026-01-01T09:00")).toString());
console.log("cronToRule:", JSON.stringify(cronToRule("0 9 * * 5L", Temporal.PlainDate.from("2026-01-01"))?.byWeekday));
console.log("ruleToCron:", ruleToCron({ start: Temporal.PlainDate.from("2026-01-01"), freq: "monthly", byHour: [9], byWeekday: [{ weekday: "FR", nth: -1 }] }));
console.log("parseCron fields:", parseCron("0 9 * * 1-5").hour.wildcard === false);
