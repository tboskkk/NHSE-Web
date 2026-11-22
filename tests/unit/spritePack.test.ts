import { expect, test } from "bun:test";
import { createPackStore, importPack, parsePackName } from "../../app/src/map/spritePack";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const file = (name: string, data: Uint8Array = PNG) => ({ name, data });

test("parsePackName accepts NNNNN_V.png (any case, any folder), rejects the rest", () => {
  expect(parsePackName("00123_4.png")).toEqual({ id: 123, variant: 4 });
  expect(parsePackName("img/00001_0.PNG")).toEqual({ id: 1, variant: 0 });
  expect(parsePackName("1.png")).toBeNull();
  expect(parsePackName("abc_0.png")).toBeNull();
  expect(parsePackName("00001_0.jpg")).toBeNull();
  expect(parsePackName("00001_.png")).toBeNull();
});

test("importPack keeps valid PNGs, skips bad names, non-PNG data and duplicates, and counts skips", () => {
  const { entries, skipped } = importPack([
    file("00010_0.png"),
    file("00010_1.png"),
    file("00010_0.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])), // duplicate: first wins
    file("notes.txt"),
    file("00011_0.png", new Uint8Array([1, 2, 3])), // not a PNG
  ]);
  expect([...entries.keys()].sort()).toEqual(["10_0", "10_1"]);
  expect(entries.get("10_0")).toEqual(PNG);
  expect(skipped).toBe(3);
});

test("importPack of nothing is empty with zero skipped", () => {
  const r = importPack([]);
  expect(r.entries.size).toBe(0);
  expect(r.skipped).toBe(0);
});

test("packStore falls back to memory when IndexedDB is missing or throws", async () => {
  for (const idb of [undefined, { open() { throw new Error("blocked"); } } as unknown as IDBFactory]) {
    const store = createPackStore(idb);
    expect((await store.load()).size).toBe(0);
    await store.save(new Map([["1_0", PNG]]));
    expect((await store.load()).get("1_0")).toEqual(PNG);
    await store.clear();
    expect((await store.load()).size).toBe(0);
  }
});
