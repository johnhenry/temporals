# Reference scheduler

A **minimal reference scheduler** built on `temporals`, demonstrating one idea:

```
Schedule = WHEN   ← pure, owned by `temporals` (cron / RRULE / range → occurrences)
Scheduler = DO IT ← this thin layer (timers + execution)
```

`temporals` computes *when*; this is the small piece that waits and fires.

## Run

From the repo root (after `npm install` + `npm run build`):

```sh
node examples/scheduler/demo.mjs      # preview + a live every-2s job
node --test examples/scheduler        # the scheduler's own tests
```

## Usage

```js
import "temporal-polyfill/global"; // only needed on Node < 22
import { Scheduler } from "./scheduler.mjs";

const scheduler = new Scheduler();

// cron string (timeZone required) …
scheduler.add("report", "0 9 * * 1-5", (t) => console.log("run", t.toString()), {
  timeZone: "America/New_York",
});

// … or any temporals Schedule (cron / RRULE / range)
import { Schedule } from "temporals";
scheduler.add(
  "biweekly",
  Schedule.rule({ start: Temporal.PlainDate.from("2026-01-01"), freq: "weekly", interval: 2, byWeekday: ["MO"] }),
  () => sync(),
);
```

`new Scheduler({ now, onError })` — inject `now()` for testing; `onError` handles
handler exceptions.

## What this is NOT

A production scheduler. Deliberately out of scope: **durability** (in-memory
only), **missed-run catch-up** (lost if the process is down when due),
**clustering / locking** (would double-fire), **delivery guarantees**
(at-most-once within one live process). For real workloads, take the *when* from
`temporals` (`schedule.next(now)` / `schedule.between(a, b)`) and feed it into a
durable queue or job runner — the DST correctness and unified cron/RRULE/range
model come along for free.
