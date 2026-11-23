import { expect, test } from "bun:test";
import { readSarc, unzs } from "../../scripts/sprites/container";
import { buildSarc } from "./spriteFixtures";

test("readSarc returns every file by name with its bytes", () => {
  const sarc = buildSarc({ "a.bfres": Uint8Array.of(1, 2, 3), "dir/b.bntx": Uint8Array.of(9) });
  const files = readSarc(sarc);
  expect([...files.keys()].sort()).toEqual(["a.bfres", "dir/b.bntx"]);
  expect([...files.get("a.bfres")!]).toEqual([1, 2, 3]);
  expect([...files.get("dir/b.bntx")!]).toEqual([9]);
});

test("readSarc rejects data without SARC magic", () => {
  expect(() => readSarc(new Uint8Array(64))).toThrow(/SARC/);
});

test("unzs inflates zstd data", () => {
  const raw = new TextEncoder().encode("hello hello hello hello");
  expect([...unzs(Bun.zstdCompressSync(raw))]).toEqual([...raw]);
});
