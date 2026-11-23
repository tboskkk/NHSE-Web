import { existsSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL("./dotnet/", import.meta.url).pathname;
export const HELPER_DLL = join(DIR, "bin/Release/net10.0/sprites-helper.dll");

/** Runs the .NET helper (`bcsv` / `bfres`, see dotnet/Program.cs); throws with its stderr on failure. */
export async function runHelper(args: string[]): Promise<void> {
  if (!existsSync(HELPER_DLL)) throw new Error("helper not built: run `dotnet build scripts/sprites/dotnet -c Release`");
  const home = process.env.HOME!;
  const proc = Bun.spawn(["dotnet", HELPER_DLL, ...args], {
    env: { ...process.env, DOTNET_ROOT: `${home}/.dotnet`, PATH: `${home}/.dotnet:${process.env.PATH}`, DOTNET_CLI_TELEMETRY_OPTOUT: "1" },
    stdout: "ignore",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`helper ${args[0]} failed (${code}): ${await new Response(proc.stderr).text()}`);
}
