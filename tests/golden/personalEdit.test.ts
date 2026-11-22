import { expect } from "bun:test";
import { replaceOccurrences, u16 } from "../../packages/core/src/util/bytes";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { renamePlayer, renameTown } from "../../packages/core/src/save/personal";
import { goldenTest, readDir, SAVE } from "./helpers";

const load = () => HorizonSave.load(readDir(SAVE!));

function count(sav: HorizonSave, pattern: Uint8Array): number {
  let n = 0;
  for (const p of sav.pairs()) {
    const copy = p.data.slice();
    const dummy = pattern.map((b) => b ^ 0xff);
    const c = replaceOccurrences(copy, pattern, dummy);
    n += Math.max(c, 0);
  }
  return n;
}

goldenTest("writing a wallet value keeps shift/adjust and the checksum verifies", async () => {
  const pe = (await load()).players[0]!.personal;
  const before = pe.wallet;
  pe.wallet = { ...before, value: 12345 };
  const after = pe.wallet; // readVerify throws on a bad checksum
  expect(after.value).toBe(12345);
  expect(after.shift).toBe(before.shift);
  expect(after.adjust).toBe(before.adjust);
});

goldenTest("player names truncate to 10 UTF-16 units without overflowing", async () => {
  const sav = await load();
  const pe = sav.players[0]!.personal;
  const off = pe.offsets.PersonalId + 0x20;
  const guard = pe.data.slice(off + 20, off + 24);
  pe.playerName = "ABCDEFGHIJKLMNOP";
  expect(pe.playerName).toBe("ABCDEFGHIJ");
  expect([...pe.data.slice(off + 20, off + 24)]).toEqual([...guard]);

  pe.playerName = "123456789😀"; // 9 + surrogate pair (11 units) -> truncated to 10 units
  expect(u16(pe.data, off + 18)).toBe("😀".charCodeAt(0));
  expect([...pe.data.slice(off + 20, off + 24)]).toEqual([...guard]);

  pe.playerName = "Hi";
  expect(pe.playerName).toBe("Hi");
});

goldenTest("renaming a player updates every occurrence of the identity in all files", async () => {
  const sav = await load();
  const pe = sav.players[0]!.personal;
  const old = pe.playerIdentity();
  const before = count(sav, old);
  expect(before).toBeGreaterThan(0);

  renamePlayer(sav, 0, "Zed");
  expect(pe.playerName).toBe("Zed");
  expect(count(sav, old)).toBe(0);
  expect(count(sav, pe.playerIdentity())).toBe(before);
});

goldenTest("renaming the town updates the town identity everywhere", async () => {
  const sav = await load();
  const pe = sav.players[0]!.personal;
  const old = pe.townIdentity();
  const before = count(sav, old);
  expect(before).toBeGreaterThan(0);
  renameTown(sav, "Newtown");
  expect(pe.townName).toBe("Newtown");
  expect(count(sav, old)).toBe(0);
  expect(count(sav, pe.townIdentity())).toBe(before);
});

goldenTest("slot counts and item set/get round-trip", async () => {
  const pe = (await load()).players[0]!.personal;
  expect(pe.slotCount("pocket")).toBe(20);
  expect(pe.slotCount("bag")).toBe(20);
  expect(pe.slotCount("itemChest")).toBe(9000);
  const items = pe.getItems("pocket");
  const it = items[2]!;
  const orig = it.raw;
  it.raw = 0x0000000100000b06n;
  pe.setItem("pocket", 2, it);
  expect(pe.getItems("pocket")[2]!.raw).toBe(0x0000000100000b06n);
  expect(pe.getItems("pocket")[3]!.raw).toBe(items[3]!.raw);
  expect(orig).not.toBe(0x0000000100000b06n);
});
