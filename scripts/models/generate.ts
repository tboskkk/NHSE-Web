import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Geometry, encodeGeometry, type Manifest } from "../../app/src/map3d/modelFormat";
import { type BntxTexture, type DecodedTexture, decodeTexture } from "../sprites/bntx";
import { encodePng } from "../sprites/png";
import { atlas, bakeCell, bakeColourCell, type Grey, pickRow, type Ramp } from "./bake";
import { runHelper } from "../sprites/helper";
import { joinFieldItems, parseFgMain, type PlantRef } from "./fgmain";
import { type DumpedModel, loadPlantFile } from "./plantFile";
import { enumeratePieces, parseUnitParam, pieceFile } from "./terrain";
import { bakeTerrainMaterial, type TexLookup } from "./terrainBake";

export type ModelSource = {
  fgMain(): Promise<Map<string, PlantRef>>;
  plant(file: string): Promise<{ models: DumpedModel[]; textures: BntxTexture[] } | null>;
  /** Terrain unit id -> piece name (`FieldLandMakingUnitModelParam`); sources without it export no terrain. */
  unitParam?(): Promise<Map<number, string>>;
};
export type Report = { models: number; textures: number; pieces: number; items: number; skipped: number; reasons: Record<string, number>; entries: Record<string, string> };

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
    const albName = mat.textures.find((n) => /_Alb(Gry)?$/.test(n)) ?? `${mat.name}_AlbGry`;
    const a = need(albName);
    const opName = mat.textures.find((n) => n.endsWith("_OP")) ?? `${mat.name}_OP`;
    const op = find(opName) ? need(opName) : null;
    const grey = (d: ReturnType<typeof decodeTexture>): Grey => ({ width: d.width, height: d.height, data: d.data });
    if (a.channels === 4) return bakeColourCell(a, op ? grey(op) : null, CELL); // plain colour albedo: no ramp
    const rampName = mat.textures.find((n) => n.endsWith("_Grd"));
    const r = rampName ? need(rampName) : null;
    const ramp: Ramp | null = r ? { width: r.width, height: r.height, data: r.data } : null;
    return bakeCell(grey(a), op ? grey(op) : null, ramp, ramp && rampName ? pickRow(ramp, rampKind(rampName), colour) : 0, CELL);
  });
  const at = atlas(cells, CELL);
  return encodePng(at.width, at.height, at.data);
}

/** Writes the model pack (`models.json`, `geo/`, `tex/`) to `opts.out` and a report next to it. Failures are recorded per item, never thrown. */
export async function generateModels(opts: { out: string; only?: string; /** default: on unless `only` is set */ terrain?: boolean }, fieldItems: Record<string, { name: string }>, src: ModelSource): Promise<Report> {
  const report: Report = { models: 0, textures: 0, pieces: 0, items: 0, skipped: 0, reasons: {}, entries: {} };
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
  if ((opts.terrain ?? opts.only === undefined) && src.unitParam) await exportTerrain(opts.out, src, manifest, report);
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  writeFileSync(join(opts.out, "models.json"), JSON.stringify({ version: 1, items: sorted(manifest.items), models: sorted(manifest.models), ...(manifest.terrain ? { terrain: sorted(manifest.terrain) } : {}) }, null, 1));
  writeFileSync(`${opts.out}.report.json`, JSON.stringify({ ...report, reasons: sorted(report.reasons), entries: sorted(report.entries) }, null, 1));
  return report;
}

const TERRAIN_TEX = 256;

/** A terrain piece keeps its raw (tiling) UVs and splits the indices into one group per textured material, sorted by material name. */
function buildPieceGeometry(m: DumpedModel): { geometry: Geometry; materials: string[] } {
  const textured = new Set(m.materials.filter((x) => x.textures.length > 0).map((x) => x.name));
  const materials = [...new Set(m.shapes.map((s) => s.mat).filter((n) => textured.has(n)))].sort();
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const groups: NonNullable<Geometry["groups"]> = [];
  materials.forEach((mat, k) => {
    const start = idx.length;
    for (const s of m.shapes) {
      if (s.mat !== mat) continue;
      if (s.nrm.length !== s.pos.length || s.uv.length !== (s.pos.length / 3) * 2) throw new Error("incomplete vertex data");
      const base = pos.length / 3;
      pos.push(...s.pos);
      nrm.push(...s.nrm);
      uv.push(...s.uv);
      for (const i of s.idx) idx.push(i + base);
    }
    if (idx.length > start) groups.push({ start, count: idx.length - start, material: k });
  });
  if (idx.length === 0) throw new Error("empty mesh");
  return { geometry: { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx), groups }, materials };
}

/** Terrain pieces: geometry per piece (material groups, raw UVs), one baked texture per material (`tex/terrain/<material>.png`, repeat-wrapped in the browser), and the `terrain` table. */
async function exportTerrain(out: string, src: ModelSource, manifest: Manifest, report: Report): Promise<void> {
  const note = (reason: string) => { report.reasons[reason] = (report.reasons[reason] ?? 0) + 1; };
  const units = await src.unitParam!();
  const base = await src.plant("FldUnit");
  if (!base) { note("missing plant file FldUnit"); return; }
  const decoded = new Map<string, DecodedTexture | null>();
  const tex: TexLookup = (n) => {
    if (!decoded.has(n)) {
      const t = base.textures.find((x) => x.name === n);
      try { decoded.set(n, t ? decodeTexture(t) : null); } catch { decoded.set(n, null); }
    }
    return decoded.get(n)!;
  };
  mkdirSync(join(out, "tex", "terrain"), { recursive: true });
  const baked = new Set<string>();
  const bakeMaterial = (mat: string): string => {
    const path = `tex/terrain/${mat}.png`;
    if (!baked.has(mat)) {
      const b = bakeTerrainMaterial(mat, tex, TERRAIN_TEX);
      if (!b.known) note(`unknown terrain material ${mat}`);
      writeFileSync(join(out, path), encodePng(TERRAIN_TEX, TERRAIN_TEX, b.cell));
      baked.add(mat);
      report.textures++;
    }
    return path;
  };
  manifest.terrain = {};
  for (const fam of enumeratePieces(units)) {
    const pf = await src.plant(fam.file);
    if (!pf) { note(`missing plant file ${fam.file}`); continue; }
    const wanted: DumpedModel[] = [];
    for (const name of fam.names) for (let v = 0; v < 4; v++) { const m = pf.models.find((x) => x.name === `${name}_${v}`); if (m) wanted.push(m); else if (v === 0) note(`missing piece ${name}_0`); }
    for (const m of wanted) {
      try {
        const g = buildPieceGeometry(m);
        const paths = g.materials.map(bakeMaterial);
        const geoPath = `geo/${m.name}.bin`;
        writeFileSync(join(out, geoPath), encodeGeometry(g.geometry));
        manifest.models[m.name] = { geometry: geoPath, texture: paths[0]!, textures: paths };
        report.pieces++;
      } catch (e) {
        note(`piece ${m.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const [id, name] of units) if (pieceFile(name) === fam.file) for (let v = 0; v < 4; v++) if (manifest.models[`${name}_${v}`]) manifest.terrain![`${id}_${v}`] = `${name}_${v}`;
  }
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
    async unitParam() {
      const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "units-"));
      try {
        await runHelper(["bcsv", join(romfs, "Bcsv/FieldLandMakingUnitModelParam.bcsv"), join(dir, "u.tsv")]);
        return parseUnitParam(readFileSync(join(dir, "u.tsv"), "utf8"));
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


