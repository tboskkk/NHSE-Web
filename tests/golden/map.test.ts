import { expect } from "bun:test";
import { join } from "node:path";
import { readMap, tileIndex } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, readDir, runReference, SAVE, tempDir } from "./helpers";

const hex = (u8: Uint8Array) => Buffer.from(u8).toString("hex");

goldenTest("map reads match upstream NHSE.Core", async () => {
  const out = tempDir();
  const file = join(out, "map.json");
  await runReference(["map", SAVE!, file]);
  const ref = JSON.parse(await Bun.file(file).text());
  const sav = await HorizonSave.load(readDir(SAVE!));
  const m = readMap(sav.main.data, sav.revision);

  // terrain: oracle emits upstream's flat (column-major) array order
  expect(m.terrain.width).toBe(ref.terrain.width);
  expect(m.terrain.height).toBe(ref.terrain.height);
  expect(ref.terrain.tiles.length).toBe(m.terrain.width * m.terrain.height);
  ref.terrain.tiles.forEach((t: Record<string, number>, i: number) => {
    expect([
      m.terrain.unitModel[i], m.terrain.variation[i], m.terrain.angle[i], m.terrain.roadModel[i],
      m.terrain.roadVariation[i], m.terrain.roadAngle[i], m.terrain.elevation[i],
    ]).toEqual([t.unitModel, t.variation, t.angle, t.roadModel, t.roadVariation, t.roadAngle, t.elevation]);
  });
  expect(m.terrain.elevation[tileIndex(96, 13, 13)]).toBe(ref.terrain.tiles[96 * 13 + 13].elevation);

  // items
  for (const [n, layer] of ([[0, "layer0"], [1, "layer1"]] as const)) {
    const L = m.items[n];
    expect([L.width, L.height]).toEqual([ref.items.width, ref.items.height]);
    expect(Array.from(L.raw, (v) => v.toString(16).padStart(16, "0"))).toEqual(ref.items[layer]);
    expect(hex(L.flags)).toBe(ref.items[n === 0 ? "flag0" : "flag1"]);
  }

  // buildings, acres, plaza
  expect(m.buildings).toEqual(ref.buildings);
  expect(Array.from(m.acres)).toEqual(ref.acres);
  expect(m.plaza).toEqual({ x: ref.plaza.x, z: ref.plaza.z });
});
