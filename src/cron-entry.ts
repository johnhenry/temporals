import type { Temporal } from "temporal-polyfill";
import { Schedule } from "./schedule.js";
import { cronOccurrences, parseCron, type CronOptions } from "./cron.js";

/**
 * Public entry for the `temporals/cron` subpath. Cron lives here — separate from
 * the core `temporals` entry — so the core stays free of the cron parser.
 */

export { cron, parseCron, type CronOptions, type ParsedCron } from "./cron.js";
export { describeCron, cronToRule, ruleToCron } from "./cron-extra.js";

/**
 * A unified {@link Schedule} from a cron expression (occurrences are
 * `ZonedDateTime`). Bridges cron into the core Schedule interface without the
 * core depending on cron.
 *
 * ```ts
 * import { cronSchedule } from "temporals/cron";
 * cronSchedule("0 9 * * 1-5", { timeZone: "America/New_York" }).nextN(now, 3);
 * ```
 */
export function cronSchedule(
  expr: string,
  options: CronOptions,
): Schedule<Temporal.ZonedDateTime> {
  const parsed = parseCron(expr, options.seconds);
  return Schedule.of<Temporal.ZonedDateTime>((from) =>
    cronOccurrences(parsed, from, options, true),
  );
}
