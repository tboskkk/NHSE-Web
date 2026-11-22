import { test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import type { SaveFiles } from "../../packages/core/src/save/horizonSave";

export const SAVE = process.env.NHSE_TEST_SAVE;
export const REPO = new URL("../..", import.meta.url).pathname;

/** Runs `test` only when NHSE_TEST_SAVE points at a real save folder; skips otherwise. */
export function goldenTest(name: string, fn: () => Promise<void>) {
  return SAVE ? test(name, fn, 120_000) : test.skip(name, fn);
}

export function tempDir(prefix = "nhse-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Runs the C# reference CLI (real upstream NHSE.Core). */
export async function runReference(args: string[]): Promise<void> {
  const home = process.env.HOME!;
  const proc = Bun.spawn(["dotnet", "run", "--no-build", "-c", "Release", "--project", join(REPO, "reference"), "--", ...args], {
    env: { ...process.env, DOTNET_ROOT: `${home}/.dotnet`, PATH: `${home}/.dotnet:${process.env.PATH}`, DOTNET_CLI_TELEMETRY_OPTOUT: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`reference ${args[0]} failed (${code}): ${await new Response(proc.stderr).text()}`);
}

/** Reads a folder recursively into a SaveFiles map with POSIX keys. */
export function readDir(dir: string): SaveFiles {
  const out: SaveFiles = new Map();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p).split(sep).join("/"), new Uint8Array(readFileSync(p)));
    }
  };
  walk(dir);
  return out;
}

export function cloneFiles(files: SaveFiles): SaveFiles {
  return new Map([...files].map(([k, v]) => [k, v.slice()]));
}

export const hash = (b: Uint8Array) => Bun.hash(b);
