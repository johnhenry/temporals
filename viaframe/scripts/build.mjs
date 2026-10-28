// Builds the viaframe pane package in this folder (viaframe/):
//
//   1. bundles src/lib.ts (the parts of @johnhenry/temporals the panes use, from ../src, with
//      temporal-polyfill as the fallback where the runtime has no Temporal) into one script;
//   2. writes panes/<id>.viaframe.json (an intermediate: git ignores it) for each pane in src/panes.mjs: a function canvas with one
//      input pane per parameter and one eval pane, `result`, whose code is the pane's code followed
//      by the bundled library, and the pane's tests;
//   3. runs `viaframe pkg pack .`, which reads viaframe-package.yaml and package.json and writes
//      temporals-viaframe.viaframe-pkg.json.
//
//   node scripts/build.mjs           build everything
//   node scripts/build.mjs --check   fail if the package file is out of date (writes only panes/)
//
// The viaframe command line isn't on npm: set VIAFRAME to its bin/viaframe.mjs (from a checkout of
// johnhenry/viaframe), or have `viaframe` on the PATH.
import { build } from "esbuild";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PANES } from "../src/panes.mjs";
import { HERE, viaframe } from "./viaframe.mjs";

const ROOT = join(HERE, "..");
const check = process.argv.includes("--check");

const version = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
const LIBRARY = `@johnhenry/temporals ${version(ROOT)} and temporal-polyfill ${version(join(ROOT, "node_modules/temporal-polyfill"))}`;

/** The library as the text of a function declaration that returns it. */
async function libraryFunction() {
  const out = await build({
    entryPoints: [join(HERE, "src/lib.ts")],
    bundle: true,
    format: "iife",
    globalName: "temporals",
    minify: true,
    legalComments: "none",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });
  const iife = out.outputFiles[0].text.trim();
  return [
    `// ${LIBRARY} (both MIT), bundled from viaframe/src/lib.ts by viaframe/scripts/build.mjs`,
    "// in github.com/johnhenry/temporals. A pane package can't import a module or share code between",
    "// its panes, so each pane carries this copy; it uses the runtime's own Temporal when there is one.",
    "function temporalsLibrary() {",
    iife,
    "return temporals;",
    "}",
  ].join("\n");
}

function canvasOf(def, library) {
  const panes = [];
  const wires = [];
  let y = 0;
  for (const input of def.inputs) {
    const id = `i_${input.name}`;
    const value = input.kind === "json" ? JSON.stringify(input.value) : input.value;
    panes.push({ id, type: "input", name: input.name, rect: { x: 0, y, width: 260 }, inputs: [], widget: { kind: input.kind, value, ...(input.options ? { options: input.options } : {}) }, ...(input.valueType ? { valueType: input.valueType } : {}), ...(input.control ? { control: input.control } : {}) });
    wires.push({ name: input.name, source: id });
    y += input.kind === "json" || input.kind === "text" ? 150 : 90;
  }
  const code = `const T = temporalsLibrary();\n${def.code}\n\n${library}\n`;
  panes.push({ id: "result", type: "eval", name: "result", rect: { x: 340, y: 0, width: 380 }, inputs: wires, autorun: true, mode: "function", outputs: def.outputs.map((name) => ({ name })), code });
  return { format: "viaframe-canvas", version: 3, name: def.id, function: true, tests: def.tests, panes };
}

const library = await libraryFunction();
const files = new Map(PANES.map((def) => [`${def.id}.viaframe.json`, `${JSON.stringify(canvasOf(def, library), null, 2)}\n`]));
const dir = join(HERE, "panes");
// panes/ is an intermediate (git ignores it): write it either way, then pack, or with --check only
// compare the package file with what packing would write.
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const [name, text] of files) writeFileSync(join(dir, name), text);
process.exit(viaframe(["pkg", "pack", ".", ...(check ? ["--check"] : [])]));
