import { expect } from "bun:test";
import { join } from "node:path";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { GameStrings } from "../../packages/core/src/strings/gameStrings";
import type { Item } from "../../packages/core/src/structures/item";
import { goldenTest, readDir, runReference, SAVE, tempDir } from "./helpers";

const fetcher = async (path: string) => JSON.parse(await Bun.file(join(import.meta.dir, `../../app/public/${path}`)).text());
const dumpItem = (s: GameStrings) => (i: Item) => ({ raw: i.raw.toString(16).padStart(16, "0"), name: s.getItemName(i) });

goldenTest("every Personal field matches upstream for every player", async () => {
  const out = tempDir();
  await runReference(["dump", SAVE!, out]);
  const ref = JSON.parse(await Bun.file(join(out, "summary.json")).text());
  const sav = await HorizonSave.load(readDir(SAVE!));
  const s = await GameStrings.load("en", fetcher);
  expect(sav.players.length).toBe(ref.players.length);

  sav.players.forEach((p, idx) => {
    const r = ref.players[idx];
    const pe = p.personal;
    expect(p.directory).toBe(r.directory);
    expect(pe.playerName).toBe(r.playerName);
    expect(pe.townName).toBe(r.townName);
    expect(pe.playerId).toBe(r.playerId);
    expect(pe.townId).toBe(r.townId);
    expect(pe.wallet.value).toBe(r.wallet);
    expect(pe.bank.value).toBe(r.bank);
    expect(pe.nookMiles.value).toBe(r.nookMiles);
    expect(pe.totalNookMiles.value).toBe(r.totalNookMiles);
    expect(pe.hotelTickets?.value ?? null).toBe(r.hotelTickets);
    expect(pe.pocketCount).toBe(r.pocketCount);
    expect(pe.bagCount).toBe(r.bagCount);
    expect(pe.itemChestCount).toBe(r.itemChestCount);
    expect(pe.birthday).toEqual(r.birthday);
    expect(pe.profileBirthday).toEqual(r.profileBirthday);
    expect(pe.profileFruit).toBe(r.profileFruit);
    for (const area of ["pocket", "bag", "itemChest"] as const) {
      const mine = pe.getItems(area).map(dumpItem(s));
      expect(mine.length).toBe(r[area].length);
      expect(mine).toEqual(r[area]);
    }
  });
});
