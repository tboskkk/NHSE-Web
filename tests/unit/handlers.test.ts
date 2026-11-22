import { expect } from "bun:test";
import { createApi } from "../../app/src/worker/handlers";
import { cloneFiles, goldenTest, readDir, SAVE } from "../golden/helpers";

const fetcher = async (path: string) => JSON.parse(await Bun.file(new URL(`../../app/public/${path}`, import.meta.url).pathname).text());
const eq = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

const fresh = async () => {
  const api = createApi(fetcher);
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
  expect(await api.undo()).not.toBeNull();
  expect((await api.player(0)).wallet).toBe(original);
  const pv = await api.player(0);
  expect(pv.pocket.length).toBe(pv.slotCounts.pocket);
  expect(pv.pocket[0]!.raw).toMatch(/^[0-9a-f]{16}$/);
  expect(typeof pv.pocket[0]!.name).toBe("string");
});

goldenTest("build('changed') returns only the touched pair, then nothing after markSaved", async () => {
  const { api } = await fresh();
  await api.edit({ op: "wallet", player: 0, value: 777 });
  const out = await api.build("changed");
  expect([...out.keys()].sort()).toEqual(["Villager0/personal.dat", "Villager0/personalHeader.dat"]);
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
