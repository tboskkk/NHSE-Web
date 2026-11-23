import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runHelper } from "../../scripts/sprites/helper";
import { parseItemParam } from "../../scripts/sprites/itemParam";

const ROMFS = process.env.NHSE_TEST_ROMFS;
const t = ROMFS ? test : test.skip;
const tmp = () => {
  const d = join(process.env.TMPDIR ?? "/tmp", `sprites-helper-${process.pid}`);
  mkdirSync(d, { recursive: true });
  return d;
};

t("the helper dumps ItemParam and the reader finds the wire chair", async () => {
  const out = join(tmp(), "ItemParam.tsv");
  await runHelper(["bcsv", join(ROMFS!, "Bcsv/ItemParam.bcsv"), out]);
  const items = parseItemParam(readFileSync(out, "utf8"), (n) => existsSync(join(ROMFS!, `Model/${n}.Nin_NX_NVN.zs`)));
  expect(items.find((i) => i.id === 770)?.model).toBe("FtrWireChairS");
}, 120_000);
