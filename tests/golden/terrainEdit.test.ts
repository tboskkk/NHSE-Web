import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import observed from "../../packages/core/src/generated/terrain-observed.json";
import { applyOp, type EditOp } from "../../packages/core/src/edit/ops";
import { planTerrainEdit, terrainTileAt, type TerrainEditOp, type TerrainTileValue } from "../../packages/core/src/map/applyTerrainEdit";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { rotateOp } from "../../app/src/map/terrainTool";
import { goldenTest, readDir, REPO, runReference, SAVE, tempDir } from "./helpers";

const acreTiles = () => new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));
const top = (o: TerrainEditOp["changes"], label = "t"): TerrainEditOp => ({ op: "terrainEdit", label, changes: o });
const [gm, gv, ga] = Object.keys(observed.ground).find((k) => k !== "0,0,0")!.split(",").map(Number) as [number, number, number];

goldenTest("terrainEdit is byte-identical to upstream (stamp ground, elevation, rotate, batch)", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const ctx = { map, acreTiles: acreTiles() };
  const H = map.terrain.height;
  const ok = (c: TerrainEditOp["changes"]) => { try { return planTerrainEdit(ctx, top(c)).length > 0; } catch { return false; } };

  const stamps: { x: number; y: number }[] = [];
  let elev: { x: number; y: number } | null = null;
  let rot: { x: number; y: number; tile: TerrainTileValue } | null = null;
  for (let x = 0; x < map.terrain.width; x++)
    for (let y = 0; y < H; y++) {
      const cur = terrainTileAt(map, H * x + y);
      if (cur.unitModel === 0 && stamps.length < 4 && ok([{ x, y, tile: { ...cur, unitModel: gm, variation: gv, angle: ga } }]) && stamps.every((s) => Math.abs(s.x - x) > 2 || Math.abs(s.y - y) > 2)) stamps.push({ x, y });
      if (cur.unitModel === 0 && !elev && cur.elevation === 0 && ok([{ x, y, tile: { ...cur, elevation: 1 } }]) && stamps.every((s) => s.x !== x || s.y !== y)) elev = { x, y };
      const turned = { ...cur, angle: (cur.angle + 1) & 3 };
      if (cur.unitModel !== 0 && !rot && ok([{ x, y, tile: turned }])) rot = { x, y, tile: turned };
    }
  expect(stamps).toHaveLength(4);
  expect(elev).not.toBeNull();
  expect(rot).not.toBeNull();

  const stampTile = (s: { x: number; y: number }) => ({ x: s.x, y: s.y, tile: { ...terrainTileAt(map, H * s.x + s.y), unitModel: gm, variation: gv, angle: ga } });
  const ops: EditOp[] = [
    top([stampTile(stamps[0]!)], "stamp ground"),
    top([{ x: elev!.x, y: elev!.y, tile: { ...terrainTileAt(map, H * elev!.x + elev!.y), elevation: 1 } }], "elevation"),
    { ...rotateOp(map, [rot!]), changes: rotateOp(map, [rot!]).changes.map((c) => ({ ...c, rotate: true })) } as EditOp,
    { op: "batch", label: "batch", ops: [top([stampTile(stamps[1]!)]), top([stampTile(stamps[2]!), stampTile(stamps[3]!)])] },
  ];

  const tmp = tempDir();
  const opsPath = join(tmp, "ops.json");
  const out = join(tmp, "out");
  await Bun.write(opsPath, JSON.stringify(ops));
  await runReference(["edit", SAVE!, opsPath, "12345", out]);
  const expected = readDir(out);

  const env = { acreTiles: acreTiles() };
  for (const o of ops) applyOp(sav, o, env);
  const actual = new Map([...sav.passthrough, ...(await sav.save(12345))]);
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
  for (const [k, v] of expected) expect(Buffer.from(actual.get(k)!).equals(Buffer.from(v))).toBe(true);

  const after = readMap(sav.main.data, sav.revision);
  expect(after.terrain.unitModel[H * stamps[0]!.x + stamps[0]!.y]).toBe(gm);
  expect(after.terrain.angle[H * rot!.x + rot!.y]).toBe(rot!.tile.angle);
});
