import { cronSchedule } from "temporals/cron";

/**
 * A **minimal, in-memory, single-process reference scheduler** built on
 * `temporals`. It demonstrates the boundary the library is designed around:
 *
 *   Schedule = WHEN (pure, from `temporals`)   ← the library owns this
 *   Scheduler = DO IT (timers, execution)      ← this thin layer
 *
 * NOT production-durable: no persistence, no missed-run catch-up across
 * restarts, no clustering/locking, at-most-once within a live process. For real
 * workloads, feed `schedule.next(now)` into a durable queue/runner instead.
 */

const MAX_TIMEOUT = 2_147_483_647; // setTimeout caps at ~24.8 days

/**
 * @typedef {object} SchedulerOptions
 * @property {() => import("temporal-polyfill").Temporal.ZonedDateTime} [now]
 *   Injectable clock (defaults to the system-zone now). Handy for tests.
 * @property {(error: unknown, jobId: string) => void} [onError]
 */

export class Scheduler {
  /** @param {SchedulerOptions} [options] */
  constructor(options = {}) {
    this.now = options.now ?? (() => globalThis.Temporal.Now.zonedDateTimeISO());
    this.onError =
      options.onError ?? ((err, id) => console.error(`[scheduler] job "${id}" failed:`, err));
    this.jobs = new Map();
    this.stopped = false;
  }

  /**
   * Register a job. `scheduleOrCron` is either a `temporals` Schedule or a cron string.
   * @param {string} id
   * @param {import("temporals").Schedule | string} scheduleOrCron
   * @param {(fireTime: import("temporal-polyfill").Temporal.ZonedDateTime) => void | Promise<void>} handler
   * @param {{ timeZone?: string }} [opts] timeZone required when passing a cron string
   */
  add(id, scheduleOrCron, handler, opts = {}) {
    if (this.jobs.has(id)) throw new Error(`scheduler: duplicate job id "${id}"`);
    const schedule =
      typeof scheduleOrCron === "string"
        ? cronSchedule(scheduleOrCron, { timeZone: requireTz(opts.timeZone) })
        : scheduleOrCron;
    const job = { schedule, handler, timer: undefined };
    this.jobs.set(id, job);
    this.#arm(id, job);
    return this;
  }

  /** Cancel a job. @param {string} id */
  remove(id) {
    const job = this.jobs.get(id);
    if (job?.timer) clearTimeout(job.timer);
    this.jobs.delete(id);
  }

  /** Stop all jobs. */
  stop() {
    this.stopped = true;
    for (const job of this.jobs.values()) if (job.timer) clearTimeout(job.timer);
    this.jobs.clear();
  }

  #arm(id, job) {
    if (this.stopped) return;
    const now = this.now();
    const next = job.schedule.next(now);
    if (!next) return; // schedule exhausted

    const ms = next.epochMilliseconds - now.epochMilliseconds;
    if (ms > MAX_TIMEOUT) {
      job.timer = setTimeout(() => this.#arm(id, job), MAX_TIMEOUT); // too far out — re-evaluate later
      return;
    }
    job.timer = setTimeout(async () => {
      try {
        await job.handler(next);
      } catch (err) {
        this.onError(err, id);
      }
      this.#arm(id, job); // re-arm for the following occurrence
    }, Math.max(0, ms));
  }
}

function requireTz(tz) {
  if (!tz) throw new Error("scheduler: a cron job requires opts.timeZone");
  return tz;
}
