# temporals

Lazy **sequences**, **ranges**, **intervals**, and **RRULE recurrence** built on
the TC39 [Temporal](https://tc39.es/proposal-temporal/docs/) API.

Temporal ships the *atoms* of date/time — immutable points, durations, and
calendar-aware arithmetic — but no *sequence* layer. `temporals` fills that
gap: feed in parameters, get back a lazy collection of Temporal objects, either
**points** (`PlainDate`, `ZonedDateTime`, …) or **intervals** (`{ start, end }`
spans).

```ts
import { range } from "temporals";

// The next 10 weekdays, lazily.
range({ start: Temporal.Now.plainDateISO(), step: { days: 1 } })
  .filter((d) => d.dayOfWeek <= 5)
  .take(10)
  .toArray();
```

## Design

- **Iterator-first.** Generators return a re-iterable `Seq` with the standard
  iterator-helper surface (`map`/`filter`/`take`/`drop`/`flatMap`/`toArray`/…),
  so composition is native. On runtimes with native iterator helpers (Node 22+,
  modern browsers) those work too; `Seq` provides them portably so behaviour is
  identical on older runtimes.
- **Thin builder.** `seq()` / `recurBuilder()` wrap the core generators for
  discoverability. They hold no logic — every terminal delegates to a generator.
- **Temporal is a peer.** The engines derive everything from the *values* you
  pass in (their constructor, static `compare`, instance `.add`), so nothing is
  bundled. On Node < 22, install [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill)
  and `import "temporal-polyfill/global"` once at your entry point.
- **Half-open by default.** Ranges and intervals are `[start, end)` unless you
  opt into inclusive bounds.
- **Calendar-correct.** Stepping in calendar units keeps DST and month lengths
  right; month steps are anchor-relative so they don't drift
  (`Jan 31 → Feb 28 → Mar 31`, not `→ Mar 28`).

## Install

```sh
npm install temporals
# On Node < 22, also:
npm install temporal-polyfill
```

## API

### `range(options): Seq<T>`

A stepped sequence of points from `start`.

| option      | meaning                                                        |
| ----------- | ------------------------------------------------------------- |
| `start`     | first point (always included)                                 |
| `step`      | increment (`Temporal.Duration` or `{ days: 1 }`); negative descends |
| `end?`      | bound; upper for positive steps, lower for negative           |
| `count?`    | max number of points                                          |
| `inclusive?`| include a point landing exactly on `end` (default `false`)    |
| `overflow?` | `"constrain"` (default) or `"reject"` for calendar arithmetic |

With neither `end` nor `count`, the sequence is infinite — bound it with
`.take(n)`.

### `chunks(options): Seq<Interval<T>>` — partition

Adjacent, non-overlapping intervals of width `by` covering `[start, end)`. The
final partial chunk is clamped to `end` (pass `partial: false` to drop it).

### `windows(options): Seq<Interval<T>>` — sliding

Overlapping windows of width `size`, advancing each start by `step`. Only
full-width windows by default (`partial: true` emits clamped trailing windows).

### `recur(rule): Seq<T>` — RRULE recurrence

A pragmatic subset of RFC 5545:

```ts
recur({
  start: Temporal.PlainDate.from("2026-01-01"),
  freq: "monthly",
  byWeekday: [{ weekday: "TU", nth: 2 }], // 2nd Tuesday
  count: 12,
}).toArray();
```

Supported: `freq` (yearly/monthly/weekly/daily/hourly/minutely/secondly),
`interval`, `count`, `until`, `byMonth`, `byWeekNo` (yearly), `byYearDay`,
`byMonthDay` (incl. negatives), `byWeekday` (incl. `nth`),
`byHour`/`byMinute`/`bySecond`, `bySetPos`, `weekStart`.

Sub-daily frequencies require a time-bearing start (`PlainDateTime`,
`ZonedDateTime`, or `PlainTime`) and treat `by*` rules as filters; `bySetPos` is
not combined with sub-daily frequencies.

`recur.fromString("FREQ=MONTHLY;BYDAY=2TU;COUNT=12", dtstart)` and
`formatRule(rule)` provide RRULE-string interop.

### `Interval<T>`

The interval value type Temporal lacks:

```ts
const q1 = Interval.from("2026-01-01/2026-04-01");
q1.contains(someDate);
q1.overlaps(other);
q1.intersection(other);   // Interval | null
q1.toDuration();          // Temporal.Duration
q1.points({ days: 1 });   // Seq<T> of points inside
q1.toString();            // "2026-01-01/2026-04-01"
```

### Fluent builders

```ts
seq(start).step({ days: 1 }).until(end).toArray();
seq(start).step({ days: 1 }).until(end).chunks({ weeks: 1 });

recurBuilder(start).monthly().on({ weekday: "FR", nth: -1 }).count(3).toArray();
recurBuilder(start).weekly().every(2).on("MO", "WE").toString(); // -> RRULE string
```

## Supported point types

`PlainDate`, `PlainDateTime`, `ZonedDateTime` (DST-correct), `PlainYearMonth`,
`PlainTime`, and `Instant` for `range`/`chunks`/`windows`. Recurrence
(`recur`) requires a date-bearing start (`PlainDate`/`PlainDateTime`/`ZonedDateTime`).

## License

MIT
