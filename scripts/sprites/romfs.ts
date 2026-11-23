import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BntxTexture, parseBntx } from "./bntx";
import { readSarc, unzs } from "./container";
import { runHelper } from "./helper";
import { parseItemParam } from "./itemParam";
import type { Shape } from "./raster";
import type { Source } from "./run";

const SUFFIX = ".Nin_NX_NVN.zs";
const CACHE = 64;

/** Opens a romfs dump as a sprite `Source`. Rejects when the folder is not a romfs or the helper is not built. */
export async function openRomfs(romfs: string): Promise<Source> {
  const modelDir = join(romfs, "Model");
  const bcsv = join(romfs, "Bcsv/ItemParam.bcsv");
  if (!existsSync(modelDir) || !existsSync(bcsv)) throw new Error(`not a romfs dump (need Model/ and Bcsv/ItemParam.bcsv): ${romfs}`);
  const files = new Set(readdirSync(modelDir));
  const variants = new Map<string, number[]>();
  for (const f of files) {
    const m = /^(.*)ReBody(\d+)\.Nin_NX_NVN\.zs$/.exec(f);
    if (m) variants.set(m[1]!, [...(variants.get(m[1]!) ?? []), Number(m[2])].sort((a, b) => a - b));
  }
  const scratch = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "sprites-"));

  /** zs -> SARC -> the .bfres inside -> helper output dir (model.json + embedded files). Caller removes `dir`. */
  const dumpBfres = async (name: string) => {
    const sarc = readSarc(unzs(readFileSync(join(modelDir, name + SUFFIX))));
    const entry = [...sarc].find(([n]) => n.endsWith(".bfres"));
    if (!entry) throw new Error("no bfres in archive");
    const dir = scratch();
    await Bun.write(join(dir, "in.bfres"), entry[1]);
    await runHelper(["bfres", join(dir, "in.bfres"), join(dir, "out")]);
    return { dir, out: join(dir, "out"), sarc };
  };

  const tsvDir = scratch();
  try {
    await runHelper(["bcsv", bcsv, join(tsvDir, "ItemParam.tsv")]);
    var parsed = parseItemParam(readFileSync(join(tsvDir, "ItemParam.tsv"), "utf8"), (n) => files.has(n + SUFFIX));
  } finally {
    rmSync(tsvDir, { recursive: true, force: true });
  }

  const models = new Map<string, Promise<Shape[]>>();
  const loadShapes = async (model: string): Promise<Shape[]> => {
    const { dir, out } = await dumpBfres(model);
    try {
      const j = JSON.parse(readFileSync(join(out, "model.json"), "utf8")) as { shapes: Shape[] };
      return j.shapes.map((s) => ({ ...s, uv: s.uv.length ? s.uv : new Array((s.pos.length / 3) * 2).fill(0) }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  return {
    items: async () => parsed.map((p) => ({ ...p, variants: variants.get(p.model) ?? [] })),
    loadModel(model) {
      let p = models.get(model);
      if (!p) {
        p = loadShapes(model);
        models.set(model, p);
        if (models.size > CACHE) models.delete(models.keys().next().value!);
        p.catch(() => models.delete(model));
      }
      return p;
    },
    async loadTextures(model, v): Promise<BntxTexture[]> {
      const { dir, out, sarc } = await dumpBfres(`${model}ReBody${v}`);
      try {
        const emb = readdirSync(out).find((f) => f.endsWith(".bntx"));
        const bytes = emb ? readFileSync(join(out, emb)) : [...sarc].find(([n]) => n.endsWith(".bntx"))?.[1];
        if (!bytes) throw new Error("no textures in ReBody archive");
        return parseBntx(bytes);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
