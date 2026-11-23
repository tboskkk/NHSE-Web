import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BntxTexture, parseBntx } from "../sprites/bntx";
import { readSarc, unzs } from "../sprites/container";
import { runHelper } from "../sprites/helper";

export type DumpedModel = {
  name: string;
  materials: { name: string; textures: string[] }[];
  shapes: { name: string; mat: string; skin: number; pos: number[]; nrm: number[]; uv: number[]; idx: number[] }[];
};

/** One `Model/<file>.Nin_NX_NVN.zs` plant file: every model in it (with material texture names) and its BNTX textures. */
export async function loadPlantFile(romfs: string, file: string): Promise<{ models: DumpedModel[]; textures: BntxTexture[] }> {
  const sarc = readSarc(unzs(readFileSync(join(romfs, "Model", `${file}.Nin_NX_NVN.zs`))));
  const entry = [...sarc].find(([n]) => n.endsWith(".bfres"));
  if (!entry) throw new Error(`no bfres in ${file}`);
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "plant-"));
  try {
    await Bun.write(join(dir, "in.bfres"), entry[1]);
    await runHelper(["bfres-models", join(dir, "in.bfres"), join(dir, "out")]);
    const models = (JSON.parse(readFileSync(join(dir, "out", "models.json"), "utf8")) as { models: DumpedModel[] }).models;
    const bntxPath = join(dir, "out", "textures.bntx"); // family files (terrain pieces) have none
    return { models, textures: existsSync(bntxPath) ? parseBntx(new Uint8Array(readFileSync(bntxPath))) : [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
