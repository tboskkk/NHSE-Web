import { expect } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { isNone } from "../../packages/core/src/map/footprint";
import { BUILDING_ITEM_TILES, itemToWorld, PLAZA_ITEM_TILES } from "../../packages/core/src/map/geometry";
import { groundAt } from "../../packages/core/src/map/ground";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, readDir, REPO, SAVE } from "./helpers";

// Exceptions observed on the example save (rules as adjusted by the Task 1 Rulings: uniqueId 0 is exempt from uniqueness, and
// resident-services types 20/23 may stand inside the plaza).
const KNOWN: string[] = [
  "slot 0 type 22: ground water", // Airport: its dock footprint spans shore water; strict ground rule refuses moves onto water
  "slot 1 type 23: overlaps 4 items", // Resident Services tent: game-placed item (id 14815) sits under it
  "plaza: overlaps 12 items", // game-placed plaza furniture (id 12201) inside the plaza rectangle
];
const PLAZA_OK = new Set([20, 23]);

goldenTest("example save buildings and plaza satisfy the P2b rules", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const acreTiles = new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));
  const ctx = { map, acreTiles };
  const l = map.items[0]!;
  const acreW = l.width / 32;
  const origin = itemToWorld(acreW, 0, 0);
  const violations: string[] = [];
  const rects: { name: string; x: number; y: number; w: number; h: number; type: number; skipGround: boolean }[] = [];
  map.buildings.forEach((b, i) => {
    if (b.type !== 0) rects.push({ name: `slot ${i} type ${b.type}`, x: b.x, y: b.y, w: BUILDING_ITEM_TILES, h: BUILDING_ITEM_TILES, type: b.type, skipGround: b.type === 26 || b.type === 27 });
  });
  rects.push({ name: "plaza", x: map.plaza.x, y: map.plaza.z, w: PLAZA_ITEM_TILES.w, h: PLAZA_ITEM_TILES.h, type: -1, skipGround: false });
  console.log("buildings", rects.map((r) => `${r.name}@${r.x},${r.y}`).join(" | "), "origin", origin, "acreW", acreW);

  for (const r of rects) {
    const ix = r.x - origin.x, iy = r.y - origin.y;
    if (ix < 0 || iy < 0 || ix + r.w > l.width || iy + r.h > l.height) { violations.push(`${r.name}: outside the item area`); continue; }
    const bad = new Set<string>();
    let items = 0;
    for (let x = 0; x < r.w; x++) for (let y = 0; y < r.h; y++) {
      if (!r.skipGround) { const g = groundAt(ctx, ix + x, iy + y); if (g !== "land") bad.add(g); }
      for (const layer of [0, 1]) { const ly = map.items[layer]!; if (!isNone(ly.raw[ly.height * (ix + x) + (iy + y)]!)) items++; }
    }
    if (bad.size) violations.push(`${r.name}: ground ${[...bad].join("/")}`);
    if (items) violations.push(`${r.name}: overlaps ${items} items`);
  }
  for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
    const p = rects[a]!, q = rects[b]!;
    if ((p.type === -1 && PLAZA_OK.has(q.type)) || (q.type === -1 && PLAZA_OK.has(p.type))) continue;
    if (p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y) violations.push(`${p.name} overlaps ${q.name}`);
  }
  const ids = new Map<number, number>(), types = new Map<number, number>();
  map.buildings.forEach((b, i) => {
    if (b.type === 0) return;
    if (b.uniqueId !== 0 && ids.has(b.uniqueId)) violations.push(`slot ${i}: uniqueId ${b.uniqueId} duplicates slot ${ids.get(b.uniqueId)}`);
    ids.set(b.uniqueId, i);
    if (b.type !== 26 && b.type !== 27 && types.has(b.type)) violations.push(`slot ${i}: type ${b.type} duplicates slot ${types.get(b.type)}`);
    types.set(b.type, i);
    if (b.angle > 3) violations.push(`slot ${i}: angle ${b.angle}`);
  });
  console.log("violations", violations);
  expect(rects.length).toBeGreaterThan(5);
  expect(violations).toEqual(KNOWN);
});
