import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyOp, type EditOp } from "../../packages/core/src/edit/ops";
import { planBuildingEdit, type BuildingEditOp } from "../../packages/core/src/map/applyBuildingEdit";
import type { BuildingInfo } from "../../packages/core/src/map/building";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, hash, readDir, REPO, runReference, SAVE, tempDir } from "./helpers";

const bld = (type: number, x: number, y: number, over: Partial<BuildingInfo> = {}): BuildingInfo => ({ type, x, y, angle: 0, bit: 0, subType: 0, typeArg: 0, uniqueId: 0, ...over });
const bop = (changes: BuildingEditOp["changes"], plaza?: BuildingEditOp["plaza"], label = "b"): BuildingEditOp => ({ op: "buildingEdit", label, changes, ...(plaza ? { plaza } : {}) });
const acreTiles = () => new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));

goldenTest("buildingEdit is byte-identical to upstream (move, retype, clear, add, swap, plaza, batch)", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const ctx = { map, acreTiles: acreTiles() };
  const B = map.buildings;
  const ok = (o: BuildingEditOp) => { try { planBuildingEdit(ctx, o); return true; } catch { return false; } };

  // free plaza spot, then free 4x4 spots that do not touch it or each other
  let plaza: { x: number; z: number } | null = null;
  for (let x = 20; x < 260 && !plaza; x += 2) for (let z = 40; z < 200 && !plaza; z += 2) if ((x !== map.plaza.x || z !== map.plaza.z) && ok(bop([], { x, z }))) plaza = { x, z };
  expect(plaza).not.toBeNull();
  const spots: { x: number; y: number }[] = [];
  for (let x = 20; x < 280 && spots.length < 4; x += 6)
    for (let y = 40; y < 220 && spots.length < 4; y += 6) {
      if (x < plaza!.x + 24 && x + 4 > plaza!.x && y < plaza!.z + 20 && y + 4 > plaza!.z) continue;
      if (spots.some((s) => Math.abs(s.x - x) < 6 && Math.abs(s.y - y) < 6)) continue;
      if (ok(bop([{ slot: 20, building: bld(5, x, y, { uniqueId: 99 }) }]))) spots.push({ x, y });
    }
  expect(spots.length).toBe(4);

  const ops: EditOp[] = [
    bop([{ slot: 5, building: { ...B[5]!, x: spots[0]!.x, y: spots[0]!.y } }], undefined, "move"),
    bop([{ slot: 4, building: { ...B[4]!, type: 11, angle: 2, subType: 3, typeArg: 4, bit: -2 } }], undefined, "retype"),
    bop([{ slot: 3, building: bld(0, B[3]!.x, B[3]!.y, { angle: 1, uniqueId: 4 }) }], undefined, "clear"),
    bop([{ slot: 6, building: bld(12, spots[1]!.x, spots[1]!.y, { uniqueId: 5, angle: 3, subType: 7 }) }], undefined, "add"),
    bop([{ slot: 2, building: { ...B[2]!, x: B[4]!.x, y: B[4]!.y } }, { slot: 4, building: { ...B[4]!, type: 11, angle: 2, subType: 3, typeArg: 4, bit: -2, x: B[2]!.x, y: B[2]!.y } }], undefined, "swap"),
    bop([], plaza!, "plaza"),
    { op: "batch", label: "batch", ops: [bop([{ slot: 7, building: bld(26, spots[2]!.x, spots[2]!.y, { uniqueId: 6 }) }]), bop([{ slot: 8, building: bld(26, spots[3]!.x, spots[3]!.y, { uniqueId: 7 }) }])] },
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
  expect(after.buildings[5]!.x).toBe(spots[0]!.x);
  expect(after.buildings[3]!.type).toBe(0);
  expect(after.buildings[6]!.type).toBe(12);
  expect(after.buildings[2]!.x).toBe(B[4]!.x);
  expect(after.plaza).toEqual(plaza!);
  expect(after.buildings[8]!.type).toBe(26);
});

goldenTest("refused building edits change no bytes (overlap, outside, duplicate id/type, unknown type, slot twice)", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const B = map.buildings;
  const env = { acreTiles: acreTiles() };
  const before = hash(sav.main.data);
  const bad: [BuildingEditOp, string][] = [
    [bop([{ slot: 5, building: { ...B[5]!, x: B[2]!.x + 1, y: B[2]!.y } }]), "overlaps building in slot 2"],
    [bop([{ slot: 5, building: { ...B[5]!, x: 286, y: 100 } }]), "outside the item area"],
    [bop([{ slot: 10, building: bld(5, 20, 60, { uniqueId: 5 }) }, { slot: 11, building: bld(6, 30, 60, { uniqueId: 5 }) }]), "uniqueId 5 is already used"],
    [bop([{ slot: 10, building: bld(21, 20, 60, { uniqueId: 5 }) }]), "already used by slot 5"],
    [bop([{ slot: 10, building: bld(30, 20, 60, { uniqueId: 5 }) }]), "unknown building type 30"],
    [bop([{ slot: 5, building: B[5]! }, { slot: 5, building: B[5]! }]), "slot 5 appears twice"],
    [bop([{ slot: 5, building: { ...B[5]!, x: B[1]!.x, y: B[1]!.y } }]), "overlaps"],
  ];
  for (const [o, why] of bad) {
    expect(() => applyOp(sav, o, env)).toThrow(why);
    expect(hash(sav.main.data)).toBe(before);
  }
});
