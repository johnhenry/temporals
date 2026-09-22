# Agent playbook

`@johnhenry/temporals` — lazy sequences, ranges, intervals, and RRULE
recurrence built on the TC39 Temporal API. Single package, Node >= 26,
`node --test` via `tsx` for TypeScript tests (`npm test`), builds to `dist/`
via `tsup` (ESM + CJS + `.d.ts`/`.d.cts`). The library itself is runtime-agnostic
JS/TS — Temporal is a peer, not bundled, so on Node < 22 a consumer also needs
`temporal-polyfill`; that constraint doesn't affect this repo's own tests
(they run on the CI floor, which ships native `Temporal`).

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm run typecheck` — `tsc --noEmit`.
2. `npm test` — `node --import tsx --test test/*.test.ts`.
3. `npm run build && npm pack --dry-run` — read the file list, not just the
   exit code; `files` is only `["dist", "README.md"]`, so anything the
   package needs at runtime must land under `dist/`.
4. `npm run examples` — every file in `examples/*.mjs` imports
   `@johnhenry/temporals` by its published name, so it only proves anything
   against a fresh `npm run build` (see gotcha below).
5. A genuinely fresh clone:
   `git clone . /tmp/temporals-verifyN && cd $_ && npm ci && npm run build && npm test`.
   This is the only way to catch "works on my checked-out tree" bugs
   (missing files in `package.json`'s `files`, undeclared deps).
6. Commit, push, close the issue with a comment naming the commit SHA.

CI (`.github/workflows/ci.yml`) runs typecheck, test, and build in that
order; match it locally.

## Repo-specific gotchas

- **Examples import the package by its published name, not a relative
  path.** After the rename into the `@johnhenry` scope, the example files
  still imported the old unscoped `temporals` specifier, which silently
  broke `npm run examples` (module-not-found) until fixed. Any future
  rename or scope change must grep `examples/*.mjs` for the import
  specifier, not just `package.json`.
- **`node --test` on a bare directory stopped working.** `test:example`
  used to point `node --test` at the `examples/scheduler` directory; Node
  26 no longer accepts a bare directory there, so it now points at the
  explicit file `examples/scheduler/test.mjs`. If a future test file moves,
  update the script, not just the file.
- **Calendar-aware behavior (`recur` month/year stepping, non-ISO
  calendars) needs `temporal-polyfill/full` or a native `Temporal` with full
  ICU** — the default/minimal polyfill build silently gives wrong answers
  for non-Gregorian calendars rather than throwing. Anything touching
  `byWeekNo`/non-ISO calendar tests should confirm which polyfill build CI
  actually has installed.

## Definition of done

A change is done when all of the following hold, not just when tests pass:
- A regression test exists for any bug fixed — fixing a bug without a test
  that would have caught it means it can come back unnoticed.
- Anything the feature does **not** do is stated in the README's
  [Scope & limitations](README.md#scope--limitations) section, not only in
  an issue comment.
- `CHANGELOG.md` has an entry.
- If a subpath's public API changed, `npm run docs` (TypeDoc) still builds
  cleanly and the guided docs section on opensource.johnhenry.me stays
  accurate (ported separately, not part of this repo's build).

## Releases

Bump `version` in `package.json`, add the `CHANGELOG.md` entry, merge, then
`npm version <bump> && git push --follow-tags` — `.github/workflows/release.yml`
is tag-triggered (`v*.*.*`), not the family's usual `release: published`
event; the workflow's own header comment explains why (single explicit
publish path, retry via "Re-run failed jobs"). It verifies the tag matches
`package.json`'s version, runs the full gate, then publishes idempotently
(`npm view` pre-flight guard) with `--provenance --access public`.
