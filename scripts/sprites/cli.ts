// Usage: bun run gen:sprites --romfs <dir> [--out personal-sprites] [--only <id|model>] [--jobs 4]
// Renders top-down sprites for Ftr items with ReBody variants. Output is Nintendo-derived: never commit it.
import { join } from "node:path";
import { openRomfs } from "./romfs";
import { runAll } from "./run";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const romfs = arg("romfs");
if (!romfs) {
  console.error("usage: bun run gen:sprites --romfs <dir> [--out dir] [--only id|model] [--jobs n]");
  process.exit(1);
}
try {
  const src = await openRomfs(romfs);
  const r = await runAll(
    {
      out: arg("out") ?? join(new URL("../..", import.meta.url).pathname, "personal-sprites"),
      only: arg("only"),
      jobs: Number(arg("jobs") ?? 4),
      onProgress: (d, t) => d % 200 === 0 && console.error(`${d}/${t}`),
    },
    src,
  );
  console.log(`rendered ${r.rendered}, existing ${r.existing}, skipped ${r.skipped}, several _Alb ${r.multiAlb}`);
  for (const [k, n] of Object.entries(r.reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
