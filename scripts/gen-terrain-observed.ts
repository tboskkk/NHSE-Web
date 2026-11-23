// Scans real saves and records which terrain tile combinations occur, for the strict terrain editor.
// Usage: bun scripts/gen-terrain-observed.ts [--merge] <saveDir>...   (default dir: $NHSE_TEST_SAVE)
// Output: packages/core/src/generated/terrain-observed.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyUnit, HorizonSave, readMap } from "../packages/core/src";
import { readDir } from "../tests/golden/helpers";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "packages/core/src/generated/terrain-observed.json");
const args = process.argv.slice(2);
const merge = args.includes("--merge");
const dirs = args.filter((a) => a !== "--merge");
if (dirs.length === 0 && process.env.NHSE_TEST_SAVE) dirs.push(process.env.NHSE_TEST_SAVE);
if (dirs.length === 0) throw new Error("pass at least one save directory or set NHSE_TEST_SAVE");

type Table = { saves: number; ground: Record<string, number>; road: Record<string, number>; elevation: Record<string, [number, number]> };
const table: Table = merge && existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { saves: 0, ground: {}, road: {}, elevation: {} };

for (const dir of dirs) {
  const sav = await HorizonSave.load(readDir(dir));
  const t = readMap(sav.main.data, sav.revision).terrain;
  for (let i = 0; i < t.width * t.height; i++) {
    const g = `${t.unitModel[i]},${t.variation[i]},${t.angle[i]}`;
    const r = `${t.roadModel[i]},${t.roadVariation[i]},${t.roadAngle[i]}`;
    table.ground[g] = (table.ground[g] ?? 0) + 1;
    table.road[r] = (table.road[r] ?? 0) + 1;
    const cls = classifyUnit(t.unitModel[i]!);
    const e = t.elevation[i]!;
    const range = table.elevation[cls];
    table.elevation[cls] = range ? [Math.min(range[0], e), Math.max(range[1], e)] : [e, e];
  }
  table.saves++;
}

const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
writeFileSync(out, JSON.stringify({ saves: table.saves, ground: sorted(table.ground), road: sorted(table.road), elevation: sorted(table.elevation) }, null, 2) + "\n");
console.log(`wrote ${out}: ${Object.keys(table.ground).length} ground, ${Object.keys(table.road).length} road combinations from ${table.saves} save(s)`);
