// Runnable demo:  node examples/scheduler/demo.mjs   (from the repo root)
import "temporal-polyfill/global"; // no-op on Node 22+ with native Temporal
import { Schedule } from "temporals";
import { cronSchedule, describeCron } from "temporals/cron";
import { Scheduler } from "./scheduler.mjs";

const TZ = "America/New_York";

// 1. Pure "WHEN": preview upcoming fire times without executing anything.
const s = cronSchedule("0 9 * * 1-5", { timeZone: TZ });
const now = Temporal.Now.zonedDateTimeISO(TZ);
console.log(`cron "0 9 * * 1-5"  (${describeCron("0 9 * * 1-5")})`);
console.log("next 3 fire times:");
for (const z of s.nextN(now, 3)) console.log("   ", z.toString());

// 2. The boundary: cron / RRULE / range all share the Schedule interface.
console.log("\nSame interface, different sources:");
console.log(
  "  RRULE 2nd Tuesday:",
  Schedule.rule({
    start: Temporal.PlainDate.from("2026-01-01"),
    freq: "monthly",
    byWeekday: [{ weekday: "TU", nth: 2 }],
  })
    .nextN(now.toPlainDate(), 2)
    .map(String)
    .join(", "),
);
console.log("  cron 'last weekday':", describeCron("0 0 LW * *"));

// 3. Live "DO IT": run an every-2-seconds job a few times, then stop.
console.log("\nLive scheduler (every 2s, 3 times):");
const scheduler = new Scheduler();
let fires = 0;
scheduler.add(
  "heartbeat",
  "*/2 * * * * *",
  (fireTime) => {
    fires++;
    console.log(`   fire #${fires} at ${fireTime.toPlainTime().toString()}`);
    if (fires >= 3) {
      scheduler.stop();
      console.log("   done.");
    }
  },
  { timeZone: TZ },
);
