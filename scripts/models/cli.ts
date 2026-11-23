// Usage: bun run gen:models --romfs <dir> [--out personal-models] [--only <itemId|itemName>]
// Exports the game's tree, bush, flower, weed and stump models into a pack the Map page imports. Output is Nintendo-derived: never commit it.
import { join } from "node:path";
import items from "../../packages/core/src/generated/items.json";
import { generateModels, openRomfsModels } from "./generate";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const romfs = arg("romfs");
if (!romfs) {
  console.error("usage: bun run gen:models --romfs <dir> [--out dir] [--only itemId|itemName] [--no-terrain]");
  process.exit(1);
}
try {
  const src = await openRomfsModels(romfs);
  const out = arg("out") ?? join(new URL("../..", import.meta.url).pathname, "personal-models");
  const r = await generateModels({ out, only: arg("only"), terrain: !process.argv.includes("--no-terrain") }, (items as unknown as { fieldItems: Record<string, { name: string }> }).fieldItems, src);
  console.log(`items ${r.items}, models ${r.models}, terrain pieces ${r.pieces}, textures ${r.textures}, skipped ${r.skipped}  (report: ${out}.report.json)`);
  for (const [k, n] of Object.entries(r.reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
