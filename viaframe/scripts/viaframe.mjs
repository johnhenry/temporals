// Runs the viaframe command line with these arguments, from this folder (viaframe/).
//   node scripts/viaframe.mjs pkg test .
// The viaframe command line isn't on npm: set VIAFRAME to its bin/viaframe.mjs (from a checkout of
// johnhenry/viaframe), or have `viaframe` on the PATH.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");

export function viaframe(args) {
  const cli = process.env.VIAFRAME;
  const [cmd, argv] = cli ? [process.execPath, [cli, ...args]] : ["viaframe", args];
  const r = spawnSync(cmd, argv, { cwd: HERE, stdio: "inherit" });
  if (r.error) {
    console.error(`Can't run the viaframe command line (${r.error.message}). Set VIAFRAME to viaframe's bin/viaframe.mjs.`);
    return 1;
  }
  return r.status ?? 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(viaframe(process.argv.slice(2)));
