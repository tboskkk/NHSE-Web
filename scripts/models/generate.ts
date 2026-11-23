import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Geometry, encodeGeometry, type Manifest } from "../../app/src/map3d/modelFormat";
import { type BntxTexture, decodeTexture } from "../sprites/bntx";
import { encodePng } from "../sprites/png";
import { atlas, bakeCell, type Grey, pickRow, type Ramp } from "./bake";
import { runHelper } from "../sprites/helper";
import { joinFieldItems, parseFgMain, type PlantRef } from "./fgmain";
import { type DumpedModel, loadPlantFile } from "./plantFile";

export type ModelSource = {
  fgMain(): Promise<Map<string, PlantRef>>;
  plant(file: string): Promise<{ models: DumpedModel[]; textures: BntxTexture[] } | null>;
};
export type Report = { models: number; textures: number; items: number; skipped: number; reasons: Record<string, number>; entries: Record<string, string> };

const CELL = 128;
const SKIP_KIND = /(Node|Anim)$|Snow/;

const rampKind = (name: string): "colour" | "foliage" | "trunk" => (/Color00_Grd$|PetalColor_Grd$/.test(name) ? "colour" : /Trunk/.test(name) ? "trunk" : "foliage");

/** Geometry of the textured shapes, UVs remapped into a horizontal atlas of one cell per textured material (sorted by name). */
function buildGeometry(m: DumpedModel): { geometry: Geometry; materials: DumpedModel["materials"] } {
  const materials = m.materials.filter((x) => x.textures.length > 0).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (materials.length === 0) throw new Error("no textured material");
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const s of m.shapes) {
    const k = materials.findIndex((x) => x.name === s.mat);
    if (k < 0) continue;
    const vc = s.pos.length / 3;
    if (s.nrm.length !== s.pos.length || s.uv.length !== vc * 2) throw new Error("incomplete vertex data");
    const base = pos.length / 3;
    pos.push(...s.pos);
    nrm.push(...s.nrm);
    for (let i = 0; i < s.uv.length; i += 2) uv.push((s.uv[i]! + k) / materials.length, s.uv[i + 1]!);
    for (const i of s.idx) idx.push(i + base);
  }
  if (idx.length === 0) throw new Error("empty mesh");
  return { geometry: { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx) }, materials };
}

function bakeAtlas(materials: DumpedModel["materials"], textures: BntxTexture[], colour: number | null): Uint8Array {
  const find = (n: string) => textures.find((t) => t.name === n);
  const need = (n: string) => {
    const t = find(n);
    if (!t) throw new Error(`missing texture ${n}`);
    return decodeTexture(t);
  };
  const cells = materials.map((mat) => {
    const a = need(`${mat.name}_AlbGry`);
    const opName = `${mat.name}_OP`;
    const op = find(opName) ? need(opName) : null;
    const rampName = mat.textures.find((n) => n.endsWith("_Grd"));
    const r = rampName ? need(rampName) : null;
    const grey = (d: ReturnType<typeof decodeTexture>): Grey => ({ width: d.width, height: d.height, data: d.data });
    const ramp: Ramp | null = r ? { width: r.width, height: r.height, data: r.data } : null;
    return bakeCell(grey(a), op ? grey(op) : null, ramp, ramp && rampName ? pickRow(ramp, rampKind(rampName), colour) : 0, CELL);
  });
  const at = atlas(cells, CELL);
  return encodePng(at.width, at.height, at.data);
}

/** Writes the model pack (`models.json`, `geo/`, `tex/`) to `opts.out` and a report next to it. Failures are recorded per item, never thrown. */
export async function generateModels(opts: { out: string; only?: string }, fieldItems: Record<string, { name: string }>, src: ModelSource): Promise<Report> {
  const report: Report = { models: 0, textures: 0, items: 0, skipped: 0, reasons: {}, entries: {} };
  const skip = (id: number, reason: string) => {
    report.skipped++;
    report.reasons[reason] = (report.reasons[reason] ?? 0) + 1;
    report.entries[String(id)] = reason;
  };
  const { items, unmapped } = joinFieldItems(await src.fgMain(), fieldItems);
  const wanted = (id: number, name: string) => opts.only === undefined || opts.only === String(id) || opts.only === name;
  for (const id of unmapped) if (wanted(id, fieldItems[String(id)]!.name)) skip(id, "not in FgMainParam");

  type Want = { id: number; ref: PlantRef };
  const byFile = new Map<string, Want[]>();
  for (const [id, ref] of [...items].sort((a, b) => a[0] - b[0])) {
    if (!wanted(id, fieldItems[String(id)]!.name)) continue;
    byFile.set(ref.file, [...(byFile.get(ref.file) ?? []), { id, ref }]);
  }

  mkdirSync(join(opts.out, "geo"), { recursive: true });
  mkdirSync(join(opts.out, "tex"), { recursive: true });
  const manifest: Manifest = { version: 1, items: {}, models: {} };
  type Built = { geometry: Geometry; materials: DumpedModel["materials"]; path: string; written: boolean };
  const geoDone = new Map<string, Built | string>(); // model -> built geometry or the reason it failed
  const texDone = new Set<string>();

  for (const [file, wants] of [...byFile].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const pf = await src.plant(file);
    if (!pf) { for (const w of wants) skip(w.id, `missing plant file ${file}`); continue; }
    for (const { id, ref } of wants) {
      if (SKIP_KIND.test(ref.model)) { skip(id, "skipped model kind"); continue; }
      const dumped = pf.models.find((m) => m.name === ref.model);
      if (!dumped) { skip(id, `missing model ${ref.model}`); continue; }
      const key = `${ref.model}@${ref.colour ?? "-"}`;
      let g = geoDone.get(ref.model);
      try {
        if (g === undefined) {
          const built = buildGeometry(dumped);
          g = { ...built, path: `geo/${ref.model}.bin`, written: false };
          geoDone.set(ref.model, g);
        }
        if (typeof g === "string") { skip(id, g); continue; }
        const texPath = `tex/${file}_${ref.model}_${ref.colour ?? "-"}.png`;
        if (!texDone.has(key)) {
          const png = bakeAtlas(g.materials, pf.textures, ref.colour); // may throw: nothing is written for a failed model
          writeFileSync(join(opts.out, texPath), png);
          texDone.add(key);
          report.textures++;
        }
        if (!g.written) {
          writeFileSync(join(opts.out, g.path), encodeGeometry(g.geometry));
          g.written = true;
          report.models++;
        }
        manifest.models[key] = { geometry: g.path, texture: texPath };
        manifest.items[String(id)] = key;
        report.items++;
        report.entries[String(id)] = "ok";
      } catch (e) {
        skip(id, e instanceof Error ? e.message : String(e));
      }
    }
  }
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  writeFileSync(join(opts.out, "models.json"), JSON.stringify({ version: 1, items: sorted(manifest.items), models: sorted(manifest.models) }, null, 1));
  writeFileSync(`${opts.out}.report.json`, JSON.stringify({ ...report, reasons: sorted(report.reasons), entries: sorted(report.entries) }, null, 1));
  return report;
}

/** Opens a romfs dump as a model source. Rejects when it is not a romfs (no FgMainParam / Model folder) or the helper is not built. */
export async function openRomfsModels(romfs: string): Promise<ModelSource> {
  const bcsv = join(romfs, "Bcsv/FgMainParam.bcsv");
  if (!existsSync(bcsv) || !existsSync(join(romfs, "Model"))) throw new Error(`not a romfs dump (need Model/ and Bcsv/FgMainParam.bcsv): ${romfs}`);
  const cache = new Map<string, Awaited<ReturnType<typeof loadPlantFile>> | null>();
  return {
    async fgMain() {
      const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "fgmain-"));
      try {
        await runHelper(["bcsv", bcsv, join(dir, "FgMainParam.tsv")]);
        return parseFgMain(readFileSync(join(dir, "FgMainParam.tsv"), "utf8"));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    async plant(file) {
      if (!existsSync(join(romfs, "Model", `${file}.Nin_NX_NVN.zs`))) return null;
      if (!cache.has(file)) cache.set(file, await loadPlantFile(romfs, file));
      return cache.get(file)!;
    },
  };
}
