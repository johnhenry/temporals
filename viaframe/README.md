# @johnhenry/temporals-viaframe

Calendar and duration panes for [viaframe](https://viaframe.johnhenry.me), the spatial JavaScript notebook, made from [`@johnhenry/temporals`](https://github.com/johnhenry/temporals). It is a viaframe **pane package**: data, not code that runs on viaframe's page. Each pane is a function canvas that runs in viaframe's sandbox like any other pane, and nothing is fetched or sent: every pane computes its answer offline.

| Pane | What it gives |
| --- | --- |
| **Working hours** (`working-hours`) | Is a schedule open at a moment? `open`, `closesAt` while open, `nextOpen` while closed, the `wait` in milliseconds and in words (`waitWords`), and a `summary` ("closed; opens Fri 2026-11-27 09:00 (in 23 hours)"). |
| **Business time between** (`business-time`) | The working time between two moments: `ms`, `hours`, `words`, and how many working days the stretch touches (`businessDays`). |
| **Add business days** (`add-business-days`) | A date moved by a number of working days (negative goes back), its `weekday`, and the days off it skipped (`daysOff`). |
| **Duration in words** (`duration-words`) | Milliseconds, an ISO 8601 duration (`PT1H30M`, `P2W3D`) or shorthand (`1h 30m`) as words ("1 day, 2 hours, 3 minutes, 4 seconds", or "1d 2h 3m 4s" with `short`), with its ISO form and milliseconds. |
| **Relative time** (`relative-time`) | One time said relative to another ("in 2 days", "tomorrow", "1 day ago") in a locale, counting calendar days in a zone, and the time between in words. |
| **Next occurrences (RRULE)** (`recurrence`) | The times of an RFC 5545 rule from a start time in a zone, keeping the wall clock across daylight saving changes, with zone and in UTC. |

A schedule is a time zone (`zone`), working windows (`[["09:00", "17:00"]]`; a window that ends before it starts crosses midnight), a `weekend` (`["SA", "SU"]`, or ISO numbers 1-7) and `holidays`: `us-federal` (the 11 US federal holidays, weekend-observed), `easter`, `good-friday`, `easter-monday`, a date (`2026-12-24`, that day only), a month and day every year (`12-25`), or an object (`{ "month": 11, "weekday": "TH", "nth": 4 }`, `{ "month": 7, "day": 4, "observed": true }`, `{ "easter": -2 }`). Times are ISO times with an offset or `Z`, with a `[zone]`, or wall-clock times read in `zone`; `at`, `from` and `to` also take `now`.

Every pane returns plain data (strings, numbers, booleans, lists), so its outputs wire into any other pane, and each output is a port of its own.

## Install it in viaframe

"Pane packages…" → **Install a pane package from npm or a URL…**, and type `@johnhenry/temporals-viaframe`. viaframe asks before it reaches the CDN (jsDelivr) and shows the review: each pane's signature, code and tests ("run its tests" runs them in a sandbox of their own, with no network). After you install it, its panes are at the end of "+ add".

## How the panes carry the library

A pane package can't import a module, and its panes can't share code. Each pane's code is its own short logic, followed by one function, `temporalsLibrary()`, that holds the part of `@johnhenry/temporals` the panes use (`src/lib.ts`: working hours, business calendars and holidays, `humanizeDuration`, `formatRelative`, `parseDuration`, `recurFromString`, and an adapter that reads a pane's parameters), bundled and minified with [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill). The polyfill is used only where the runtime has no `Temporal` of its own. So each of the six panes carries about 85 kB of library, and the package file is about 550 kB.

## Developing

Everything is built from `src/panes.mjs` (each pane's inputs, code and tests) and `src/lib.ts`, with `viaframe-package.yaml` for the titles, descriptions and icons. The viaframe command line isn't on npm yet: set `VIAFRAME` to `bin/viaframe.mjs` in a checkout of viaframe (or put `viaframe` on the PATH). From this folder, after `npm ci` at the repository root:

```sh
export VIAFRAME=~/src/viaframe/bin/viaframe.mjs
npm run build   # bundle the library, write panes/ (ignored by git), viaframe pkg pack
npm run check   # the package file is up to date, and viaframe pkg check --strict
npm test        # viaframe pkg test: every pane's tests in the review's sandbox
```

The repository's own `npm test` also runs every pane's tests and the adapter's (`test/viaframe-panes.test.ts`), without viaframe.

To publish: bump `version` here, `npm run build`, sign it if you have a key (`node scripts/viaframe.mjs pkg sign . --key <key file>`, then publish the key's fingerprint here), `npm run check && npm test`, then `npm publish` from this folder. Keep pane ids and input names stable across versions: canvases find a pane by package name and id, and wires by input name.

## Limitations

- English words by default. `locale` on Duration in words is used only where the runtime has `Intl.DurationFormat`; Relative time uses `Intl.RelativeTimeFormat`, which every current runtime has.
- Durations with years, months or weeks have no fixed length: Duration in words gives them `ms: null`, and Working hours and Business time count in hours and days only.
- Working hours looks for the next opening within a year (`nextOpen: null` past that). Holidays close the whole day; a half day is a window, not a holiday.
- Relative time says less than a day in hours ("in 3 hours"), even across midnight, as `formatRelative` does.
- The library's own limits apply (its README, "Scope & limitations"): proleptic Gregorian dates, ISO-calendar weeks, no leap seconds.

MIT. The bundled `temporal-polyfill` is MIT too.
