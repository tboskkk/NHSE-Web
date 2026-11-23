import { expect } from "bun:test";
import { createApi } from "../../app/src/worker/handlers";
import { GameStrings } from "../../packages/core/src/strings/gameStrings";
import { cloneFiles, goldenTest, readDir, SAVE } from "../golden/helpers";

const fetcher = async (path: string) => JSON.parse(await Bun.file(new URL(`../../app/public/${path}`, import.meta.url).pathname).text());
const eq = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

const bytes = async (path: string) => new Uint8Array(await Bun.file(new URL(`../../app/public/${path}`, import.meta.url).pathname).arrayBuffer());

const fresh = async () => {
  const api = createApi(fetcher, bytes);
  const input = readDir(SAVE!);
  const res = await api.load(cloneFiles(input), "en");
  return { api, input, res };
};

goldenTest("load reports the island, revision and players", async () => {
  const { res } = await fresh();
  expect(res.players.length).toBeGreaterThanOrEqual(1);
  expect(res.revisionLabel).toBe("3.0.3");
  expect(res.island.length).toBeGreaterThan(0);
  expect(res.invalidHashes).toEqual([]);
});

goldenTest("edit then undo restores the wallet; player view carries item names", async () => {
  const { api } = await fresh();
  const original = (await api.player(0)).wallet;
  const r = await api.edit({ op: "wallet", player: 0, value: 777 });
  expect(r.change).toContain("Wallet");
  expect((await api.player(0)).wallet).toBe(777);
  expect((await api.undo()).label).not.toBeNull();
  expect((await api.player(0)).wallet).toBe(original);
  const pv = await api.player(0);
  expect(pv.pocket.length).toBe(pv.slotCounts.pocket);
  expect(pv.pocket[0]!.raw).toMatch(/^[0-9a-f]{16}$/);
  expect(typeof pv.pocket[0]!.name).toBe("string");
});

goldenTest("build('changed') returns only the touched pair, then nothing after commit()", async () => {
  const { api } = await fresh();
  await api.edit({ op: "wallet", player: 0, value: 777 });
  const out = await api.build("changed");
  expect([...out.keys()].sort()).toEqual(["Villager0/personal.dat", "Villager0/personalHeader.dat"]);
  await api.commit();
  expect((await api.build("changed")).size).toBe(0);
});

goldenTest("build('all') returns every file including passthrough", async () => {
  const { api, input } = await fresh();
  const out = await api.build("all");
  expect([...out.keys()].sort()).toEqual([...input.keys()].sort());
});

goldenTest("originals() stays byte-identical to the loaded input after edits and builds", async () => {
  const { api, input } = await fresh();
  await api.edit({ op: "wallet", player: 0, value: 1 });
  await api.build("all");
  const orig = await api.originals();
  expect([...orig.keys()].sort()).toEqual([...input.keys()].sort());
  for (const [k, v] of input) expect(eq(orig.get(k)!, v)).toBe(true);
});

goldenTest("itemCatalog excludes (None) and empty names", async () => {
  const { api } = await fresh();
  const cat = await api.itemCatalog("en");
  expect(cat.length).toBeGreaterThan(1000);
  expect(cat.some((c) => c.name === "(None)" || c.name === "")).toBe(false);
  expect(cat.find((c) => c.id === 8574)?.name).toBe("golden shovel");
});

// ---- Final-review fixes ----
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { encrypt } from "../../packages/core/src/crypto/encryption";

goldenTest("a zip build does not reset the in-place dirty set, and nothing resets until commit()", async () => {
  const { api } = await fresh();
  await api.edit({ op: "wallet", player: 0, value: 777 });
  await api.build("all"); // e.g. Save as zip
  expect([...(await api.build("changed")).keys()].sort()).toEqual(["Villager0/personal.dat", "Villager0/personalHeader.dat"]);
  expect((await api.build("changed")).size).toBe(2); // write "failed": still pending
  await api.commit(); // write succeeded
  expect((await api.build("changed")).size).toBe(0);
});

goldenTest("pairs with invalid hashes at load are rebuilt by an in-place save even if untouched", async () => {
  const clean = await HorizonSave.load(readDir(SAVE!));
  const region = clean.main.revision.hash["main.dat"]!.regions[0]!;
  const data = clean.main.data.slice();
  data[region.start + 4]! ^= 1;
  const enc = await encrypt(data, 7, clean.main.header);
  const corrupted = readDir(SAVE!);
  corrupted.set("main.dat", enc.data);
  corrupted.set("mainHeader.dat", enc.header);
  const api = createApi(fetcher);
  const res = await api.load(corrupted, "en");
  expect(res.invalidHashes.length).toBeGreaterThan(0);
  const out = await api.build("changed");
  expect(out.has("main.dat")).toBe(true);
  await api.commit();
  expect((await api.build("changed")).size).toBe(0);
});

goldenTest("a failed load leaves the previous save and its originals intact", async () => {
  const { api, input } = await fresh();
  await expect(api.load(new Map([["junk.txt", new Uint8Array(3)]]), "en")).rejects.toThrow();
  const orig = await api.originals();
  expect([...orig.keys()].sort()).toEqual([...input.keys()].sort());
  expect((await api.player(0)).wallet).toBeGreaterThan(0);
});

goldenTest("summary() reflects renames", async () => {
  const { api } = await fresh();
  await api.edit({ op: "playerName", player: 0, value: "Zed" });
  await api.edit({ op: "townName", value: "Newtown" });
  const s = await api.summary();
  expect(s.players[0]!.name).toBe("Zed");
  expect(s.island).toBe("Newtown");
});

goldenTest("map() throws before a save is loaded", async () => {
  const api = createApi(fetcher);
  await expect(api.map()).rejects.toThrow("No save is loaded.");
});

goldenTest("map() returns the example island's layers", async () => {
  const { api } = await fresh();
  const m = await api.map();
  expect(m.revisionLabel).toBe("3.0.3");
  expect([m.terrain.width, m.terrain.height]).toEqual([112, 96]);
  expect([m.items[0].width, m.items[0].height]).toEqual([288, 192]);
  expect(m.items[1].raw.length).toBe(288 * 192);
  expect(m.buildings.length).toBe(46);
});

goldenTest("map() returns independent buffers and leaves the save clean (read-only)", async () => {
  const { api } = await fresh();
  const a = await api.map();
  const b = await api.map();
  expect(a.terrain.elevation.buffer).not.toBe(b.terrain.elevation.buffer);
  a.terrain.elevation[0] = 999; // mutating a returned copy must not change the save
  expect((await api.map()).terrain.elevation[0]).toBe(b.terrain.elevation[0]);
  expect((await api.build("changed")).size).toBe(0);
});

goldenTest("itemName resolves a raw hex value; unknown ids do not throw", async () => {
  const { api } = await fresh();
  const none = (await GameStrings.load("en", fetcher)).noneName;
  expect(await api.itemName("000000000000fffe")).toBe(none);
  expect(typeof (await api.itemName("000000000000ffff"))).toBe("string");
  expect(typeof (await api.itemName("00000000fffffff0"))).toBe("string");
});

// ---- map editing ----
const hex16 = (raw: bigint) => raw.toString(16).padStart(16, "0");
const items = (await import("../../packages/core/src/generated/items.json")).default as unknown as { itemSizes: number[]; itemSizeTypes: { name: string }[] };
const idOf = (name: string) => items.itemSizes.findIndex((t) => items.itemSizeTypes[t]?.name === name);

async function freeSpot(api: Awaited<ReturnType<typeof fresh>>["api"], raw: string, layer: 0 | 1 = 0) {
  for (let x = 60; x < 220; x += 4)
    for (let y = 60; y < 150; y += 4) {
      const p = await api.mapPlan({ tool: "place", layer, tiles: [{ x, y }], raw });
      if (p.op && p.skipped === 0) return { x, y };
    }
  throw new Error("no free spot");
}

goldenTest("edit(mapEdit) reports touched tiles; undo and redo report the same tiles", async () => {
  const { api } = await fresh();
  const raw = hex16(BigInt(idOf("S_2_0x2_0")));
  const { x, y } = await freeSpot(api, raw);
  const e = await api.edit({ op: "mapEdit", layer: 0, label: "Place", changes: [{ x, y, raw }] });
  expect(e.touched.length).toBe(16);
  const root = e.touched.find((t) => t.index === 192 * x + y)!;
  expect(root).toMatchObject({ layer: 0, raw });
  const u = await api.undo();
  expect(u.touched.map((t) => t.index).sort()).toEqual(e.touched.map((t) => t.index).sort());
  expect(u.touched.every((t) => t.raw === "000000000000fffe")).toBe(true);
  const r = await api.redo();
  expect(r.touched).toEqual(e.touched);
});

goldenTest("non-map edits report no touched tiles", async () => {
  const { api } = await fresh();
  expect((await api.edit({ op: "wallet", player: 0, value: 12 })).touched).toEqual([]);
});

goldenTest("mapPlan never edits; a refused mapEdit rejects and leaves nothing dirty", async () => {
  const { api } = await fresh();
  const raw = hex16(BigInt(idOf("S_2_0x2_0")));
  const p = await api.mapPlan({ tool: "place", layer: 0, tiles: [{ x: 100, y: 100 }], raw });
  expect(p.counts.placed + p.skipped).toBeGreaterThan(0);
  expect((await api.build("changed")).size).toBe(0);
  await expect(api.edit({ op: "mapEdit", layer: 0, label: "x", changes: [{ x: 287, y: 5, raw }] })).rejects.toThrow("outside the map");
  expect((await api.build("changed")).size).toBe(0);
});

goldenTest("bulk weed removal plans a batch, applies as one undo step and restores on undo", async () => {
  const { api } = await fresh();
  const before = await api.map();
  const plan = await api.mapPlan({ tool: "removeWeeds", layer: "both" });
  expect(plan.counts.erased).toBeGreaterThan(0);
  expect(plan.op).not.toBeNull();
  const e = await api.edit(plan.op!);
  expect(e.history.length).toBe(1);
  const after = await api.map();
  const weeds = (m: typeof before) => m.items.reduce((n, l) => n + l.raw.filter((r) => Number(r & 0xffffn) >= 60543 && Number(r & 0xffffn) <= 60549).length, 0);
  expect(weeds(before)).toBeGreaterThan(0);
  expect(weeds(after)).toBe(0);
  await api.undo();
  expect(weeds(await api.map())).toBe(weeds(before));
});

// ---- buildings ----
async function freeBuildingMove(api: Awaited<ReturnType<typeof fresh>>["api"]) {
  const m = await api.map();
  const b = m.buildings[5]!;
  for (let x = 100; x < 260; x += 2)
    for (let y = 60; y < 200; y += 2) {
      const op = { op: "buildingEdit" as const, label: "Move", changes: [{ slot: 5, building: { ...b, x, y } }] };
      if ((await api.buildingPlan(op)).ok) return { op, b, x, y };
    }
  throw new Error("no free spot");
}

goldenTest("edit(buildingEdit) returns structures; undo and redo return old and new; other edits return null", async () => {
  const { api } = await fresh();
  const { op, b, x, y } = await freeBuildingMove(api);
  const e = await api.edit(op);
  expect(e.touched).toEqual([]);
  expect(e.structures!.buildings[5]).toMatchObject({ x, y });
  expect(e.structures!.buildings.length).toBe(46);
  const u = await api.undo();
  expect(u.structures!.buildings[5]).toMatchObject({ x: b.x, y: b.y });
  const r = await api.redo();
  expect(r.structures!.buildings[5]).toMatchObject({ x, y });
  expect((await api.edit({ op: "wallet", player: 0, value: 12 })).structures).toBeNull();
  expect((await api.edit({ op: "mapEdit", layer: 0, label: "x", changes: [] })).structures).toBeNull();
});

goldenTest("buildingPlan reports the refusal reason and never dirties the save", async () => {
  const { api } = await fresh();
  const m = await api.map();
  const b = m.buildings[5]!;
  const bad = await api.buildingPlan({ op: "buildingEdit", label: "x", changes: [{ slot: 5, building: { ...b, x: m.buildings[2]!.x + 1, y: m.buildings[2]!.y } }] });
  expect(bad).toMatchObject({ ok: false });
  expect((bad as { reason: string }).reason).toMatch(/overlaps/);
  expect((await freeBuildingMove(api)).op.op).toBe("buildingEdit");
  expect((await api.build("changed")).size).toBe(0);
});
