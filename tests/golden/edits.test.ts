import { expect, test } from "bun:test";
import { join } from "node:path";
import fixture from "../fixtures/edit-ops.json";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { EditSession } from "../../packages/core/src/edit/session";
import { GameStrings } from "../../packages/core/src/strings/gameStrings";
import { applyOp, describeOp, type EditOp } from "../../packages/core/src/edit/ops";
import { goldenTest, readDir, runReference, SAVE, tempDir } from "./helpers";

const fetcher = async (path: string) => JSON.parse(await Bun.file(new URL(`../../app/public/${path}`, import.meta.url).pathname).text());

for (const sc of fixture.scenarios) {
  goldenTest(`edit scenario "${sc.name}" is byte-identical to upstream`, async () => {
    const tmp = tempDir();
    const opsPath = join(tmp, "ops.json");
    const out = join(tmp, "out");
    await Bun.write(opsPath, JSON.stringify(sc.ops));
    await runReference(["edit", SAVE!, opsPath, String(fixture.seed), out]);
    const expected = readDir(out);

    const sav = await HorizonSave.load(readDir(SAVE!));
    for (const op of sc.ops) applyOp(sav, op as EditOp);
    const actual = new Map([...sav.passthrough, ...(await sav.save(fixture.seed))]);

    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [k, v] of expected) expect(Buffer.from(actual.get(k)!).equals(Buffer.from(v))).toBe(true);
  });
}

goldenTest("describeOp reads naturally", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const s = await GameStrings.load("en", fetcher);
  const pe = sav.players[0]!.personal;
  const w = pe.wallet.value;
  expect(describeOp(sav, s, { op: "wallet", player: 0, value: 99999 })).toBe(`Wallet: ${w.toLocaleString("en-US")} → 99,999`);
  const before = s.getItemName(pe.getItems("pocket")[3]!);
  expect(describeOp(sav, s, { op: "setItem", player: 0, area: "pocket", slot: 3, raw: "000000000000217e" })).toBe(`Pocket slot 4: ${before} → golden shovel`);
  expect(describeOp(sav, s, { op: "batch", label: "Many", ops: [] })).toBe("Many");
});

goldenTest("a batch of 3 setItem ops is one undo step", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const session = new EditSession(sav);
  const batch: EditOp = {
    op: "batch",
    label: "Fill",
    ops: [0, 1, 2].map((slot) => ({ op: "setItem", player: 0, area: "pocket", slot, raw: "000000000000217e" }) as EditOp),
  };
  session.apply("Fill", (s) => applyOp(s, batch));
  expect(session.changes.length).toBe(1);
  session.undo();
  expect(session.dirtyPairs().size).toBe(0);
});
