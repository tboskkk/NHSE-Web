import { expect } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { isExtension, isNone } from "../../packages/core/src/map/footprint";
import { readMap } from "../../packages/core/src/map/mapData";
import { checkPlacement, footprintTiles } from "../../packages/core/src/map/placement";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, readDir, REPO, SAVE } from "./helpers";

goldenTest("every item already on the example island passes the strict placement rules", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const acreTiles = new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));
  const ctx = { map, acreTiles };
  const violations = new Map<string, number>();
  let roots = 0;
  for (const layer of [0, 1] as const) {
    const l = map.items[layer];
    for (let x = 0; x < l.width; x++)
      for (let y = 0; y < l.height; y++) {
        const raw = l.raw[l.height * x + y]!;
        if (isNone(raw) || isExtension(raw)) continue;
        roots++;
        const ignore = new Set(footprintTiles(raw, x, y).map((t) => l.height * t.x + t.y));
        const why = checkPlacement(ctx, layer, x, y, raw, { ignore });
        if (why) {
          const key = `${why} id=${Number(raw & 0xffffn)}`;
          violations.set(key, (violations.get(key) ?? 0) + 1);
        }
      }
  }
  expect(roots).toBeGreaterThan(100);
  // Known game-placed exceptions on the example island (ruled in the ledger): weeds sit on cliff-edge terrain tiles that the
  // strict rules refuse for new placements, and single items touch the plaza / a building / a cliff. Anything else is a rule bug.
  const WEEDS = [60543, 60544, 60545, 60546, 60547, 60548, 60549];
  const unexpected = [...violations].filter(([k]) => !(k.startsWith("cliff id=") && WEEDS.includes(Number(k.split("=")[1]))) && !["cliff id=2579", "overlaps the plaza id=12201", "overlaps a building id=14815"].includes(k));
  expect(unexpected).toEqual([]);
  expect([...violations].reduce((n, [, c]) => n + c, 0)).toBeLessThan(roots * 0.1);
});
