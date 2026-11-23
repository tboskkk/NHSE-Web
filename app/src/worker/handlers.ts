import {
  applyOp, BUILDING_COUNT, BUILDING_SIZE, describeOp, planBuildingEdit, planTerrainEdit, terrainTileAt, EditSession, GameStrings, getKind, getMenuIconSprite, HorizonSave, Item, readMap,
  planErase, planPlace, planRect, planRemoveWhere, planReplaceAll, planToOp, WEED_IDS,
  type BuildingEditOp, type Change, type EditOp, type ItemArea, type MapData, type Plan, type SaveFiles, type TerrainEditOp,
} from "@nhse/core";
import type { Api, ItemView, PlanRequest, PlanResult, PlayerView, Structures, TerrainTouched, Touched } from "./protocol";

const clone = (files: SaveFiles): SaveFiles => new Map([...files].map(([k, v]) => [k, v.slice()]));
const hex16 = (raw: bigint) => raw.toString(16).padStart(16, "0");

const hasMapEdit = (op: EditOp): boolean => op.op === "mapEdit" || op.op === "buildingEdit" || op.op === "terrainEdit" || (op.op === "batch" && op.ops.some(hasMapEdit));

export function createApi(fetcher: (path: string) => Promise<unknown>, fetchBytes: (path: string) => Promise<Uint8Array> = async () => { throw new Error("Map data is not available."); }): Api {
  let save: HorizonSave | null = null;
  let session: EditSession<HorizonSave> | null = null;
  let strings: GameStrings | null = null;
  let original: SaveFiles = new Map();
  /** Pairs whose hashes were already invalid at load: rebuilt by the next in-place save even if untouched. */
  let forced = new Set<string>();
  const langs = new Map<string, Promise<GameStrings>>();

  const loadStrings = (lang: string) => {
    let p = langs.get(lang);
    if (!p) langs.set(lang, (p = GameStrings.load(lang, fetcher)));
    return p;
  };
  let acre: Uint8Array | null = null;
  const acreTiles = async () => (acre ??= await fetchBytes("data/acretiles.bin"));

  /** Item layer tiles whose bytes a change touched, with their current raw values. */
  const touchedBy = (change: Change | null): Touched[] => {
    if (!save || !change) return [];
    const o = save.revision.mainOffsets;
    const count = o.fieldItemAcreWidth * 32 * 192;
    const base = o.fieldItem;
    const dv = new DataView(save.main.data.buffer, save.main.data.byteOffset, save.main.data.byteLength);
    const seen = new Set<number>();
    const out: Touched[] = [];
    for (const p of change.patches) {
      if (p.path !== save.main.path) continue;
      const lo = Math.max(p.offset, base);
      const hi = Math.min(p.offset + p.after.length, base + count * 16);
      for (let b = lo; b < hi; b += 1) {
        const tile = Math.floor((b - base) / 8);
        if (seen.has(tile)) continue;
        seen.add(tile);
        const layer = (tile >= count ? 1 : 0) as 0 | 1;
        const index = tile - layer * count;
        out.push({ layer, index, raw: hex16(dv.getBigUint64(base + tile * 8, true)) });
      }
    }
    return out.sort((a, b) => a.layer - b.layer || a.index - b.index);
  };

  /** Buildings + plaza if a change touched their bytes (920 building bytes or the 12 plaza bytes), else null. */
  const structuresBy = (change: Change | null): Structures | null => {
    if (!save || !change) return null;
    const o = save.revision.mainOffsets;
    const b0 = o.mainFieldStructure, b1 = b0 + BUILDING_COUNT * BUILDING_SIZE;
    const p0 = o.outsideField + 72 * 2, p1 = p0 + 12;
    const hit = change.patches.some((p) => p.path === save!.main.path && ((p.offset < b1 && p.offset + p.after.length > b0) || (p.offset < p1 && p.offset + p.after.length > p0)));
    if (!hit) return null;
    const m = readMap(save.main.data, save.revision);
    return { buildings: m.buildings, plaza: m.plaza };
  };

  /** Parsed map reused between plan requests; dropped whenever the save bytes can change. */
  let mapCache: MapData | null = null;
  const planMap = (sav: HorizonSave): MapData => (mapCache ??= readMap(sav.main.data, sav.revision));

  /** Terrain tiles whose 14-byte records a change touched, with their current values. */
  const terrainTouchedBy = (change: Change | null): TerrainTouched[] => {
    if (!save || !change) return [];
    const base = save.revision.mainOffsets.landMakingMap;
    const end = base + 112 * 96 * 14;
    const seen = new Set<number>();
    for (const p of change.patches) {
      if (p.path !== save.main.path) continue;
      for (let b = Math.max(p.offset, base); b < Math.min(p.offset + p.after.length, end); b++) seen.add(Math.floor((b - base) / 14));
    }
    if (seen.size === 0) return [];
    const map = planMap(save);
    return [...seen].sort((a, b) => a - b).map((index) => ({ index, tile: terrainTileAt(map, index) }));
  };

  const need = () => {
    if (!save || !session || !strings) throw new Error("No save is loaded.");
    return { save, session, strings };
  };

  const summarize = (sav: HorizonSave) => ({
    island: sav.players[0]?.personal.townName ?? "",
    players: sav.players.map((p, index) => ({ index, name: p.personal.playerName, directory: p.directory })),
  });

  const itemView = (it: Item, s: GameStrings): ItemView => ({
    raw: hex16(it.raw),
    id: it.itemId,
    name: s.getItemName(it),
    sprite: getMenuIconSprite(it.itemId),
    count: it.count,
    useCount: it.useCount,
    kind: getKind(it.itemId),
  });

  return {
    async load(files, lang) {
      const s = await loadStrings(lang);
      const backup = clone(files);
      const sav = await HorizonSave.load(files); // throws before any state below is replaced
      original = backup;
      forced = new Set(sav.invalidHashes().map((h) => h.path));
      save = sav;
      mapCache = null;
      strings = s;
      session = new EditSession(sav);
      return {
        ...summarize(sav),
        revisionLabel: sav.revision.label,
        invalidHashes: sav.invalidHashes().map((h) => ({ path: h.path, start: h.region.start })),
      };
    },

    async player(i) {
      const { save, strings } = need();
      const pe = save.players[i]?.personal;
      if (!pe) throw new RangeError(`Player ${i} does not exist`);
      const area = (a: ItemArea) => pe.getItems(a).map((it) => itemView(it, strings));
      const view: PlayerView = {
        index: i,
        name: pe.playerName,
        townName: pe.townName,
        playerId: pe.playerId,
        townId: pe.townId,
        wallet: pe.wallet.value,
        bank: pe.bank.value,
        nookMiles: pe.nookMiles.value,
        totalNookMiles: pe.totalNookMiles.value,
        hotelTickets: pe.hotelTickets?.value ?? null,
        pocketCount: pe.pocketCount,
        bagCount: pe.bagCount,
        itemChestCount: pe.itemChestCount,
        slotCounts: { pocket: pe.slotCount("pocket"), bag: pe.slotCount("bag"), itemChest: pe.slotCount("itemChest") },
        birthday: pe.birthday,
        profileFruit: pe.profileFruit,
        pocket: area("pocket"),
        bag: area("bag"),
        itemChest: area("itemChest"),
      };
      return view;
    },

    async edit(op) {
      const { save, session, strings } = need();
      const env = { acreTiles: hasMapEdit(op) ? await acreTiles() : undefined };
      const label = describeOp(save, strings, op);
      mapCache = null;
      const change = session.apply(label, (s) => applyOp(s, op, env));
      return { change: change ? change.label : null, history: session.changes.map((c) => c.label), touched: touchedBy(change), structures: structuresBy(change), terrain: terrainTouchedBy(change) };
    },

    async undo() {
      mapCache = null;
      const c = need().session.undo();
      return { label: c?.label ?? null, touched: touchedBy(c), structures: structuresBy(c), terrain: terrainTouchedBy(c) };
    },
    async redo() {
      mapCache = null;
      const c = need().session.redo();
      return { label: c?.label ?? null, touched: touchedBy(c), structures: structuresBy(c), terrain: terrainTouchedBy(c) };
    },

    async buildingPlan(op: BuildingEditOp) {
      const { save } = need();
      try {
        planBuildingEdit({ map: planMap(save), acreTiles: await acreTiles() }, op);
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, reason: e instanceof Error ? e.message : String(e) };
      }
    },

    async terrainPlan(op: TerrainEditOp) {
      const { save } = need();
      try {
        planTerrainEdit({ map: planMap(save), acreTiles: await acreTiles() }, op);
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, reason: e instanceof Error ? e.message : String(e) };
      }
    },

    async mapPlan(req: PlanRequest) {
      const { save, strings } = need();
      const ctx = { map: readMap(save.main.data, save.revision), acreTiles: await acreTiles() };
      const raw = (h: string) => BigInt(`0x${h}`);
      const name = (h: string) => strings.getItemName(new Item(raw(h)));
      let plans: Plan[];
      let label: string;
      switch (req.tool) {
        case "place": plans = [planPlace(ctx, req.layer, req.tiles, raw(req.raw))]; label = `Place ${name(req.raw)}`; break;
        case "erase": plans = [planErase(ctx, req.layer, req.tiles)]; label = "Remove items"; break;
        case "rect": plans = [planRect(ctx, req.layer, req.rect, req.raw === null ? null : raw(req.raw))]; label = req.raw === null ? "Clear area" : `Fill area with ${name(req.raw)}`; break;
        case "replaceAll": plans = planReplaceAll(ctx, req.layer, raw(req.from), raw(req.to), req.match); label = `Replace ${name(req.from)} with ${name(req.to)}`; break;
        case "removeItem": plans = planRemoveWhere(ctx, req.layer, (r) => Number(r & 0xffffn) === req.id); label = `Remove all ${strings.getItemName(new Item(BigInt(req.id)))}`; break;
        case "removeWeeds": { const w = new Set(WEED_IDS); plans = planRemoveWhere(ctx, req.layer, (r) => w.has(Number(r & 0xffffn))); label = "Remove all weeds"; break; }
      }
      const used = plans.filter((p) => p.changes.length > 0);
      const result: PlanResult = {
        op: used.length === 0 ? null : used.length === 1 ? planToOp(used[0]!, label) : { op: "batch", label, ops: used.map((p) => planToOp(p, label)) },
        counts: plans.reduce((a, p) => ({ placed: a.placed + p.counts.placed, erased: a.erased + p.counts.erased, replaced: a.replaced + p.counts.replaced }), { placed: 0, erased: 0, replaced: 0 }),
        skipped: plans.reduce((n, p) => n + p.skipped.length, 0),
        sample: plans.flatMap((p) => p.skipped).slice(0, 5),
      };
      return result;
    },

    async build(mode) {
      const { save, session } = need();
      const only = mode === "changed" ? new Set([...session.dirtyPairs(), ...forced]) : undefined;
      if (only && only.size === 0) return new Map();
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
      mapCache = null;
      const out = await save.save(seed, only);
      session.absorb(); // save-time hashing mutated pair data; never record that as a user edit
      if (mode === "all") for (const [k, v] of save.passthrough) out.set(k, v.slice());
      return out;
    },

    async commit() {
      need().session.markSaved();
      forced = new Set();
    },

    async summary() {
      return summarize(need().save);
    },

    async originals() {
      return clone(original);
    },

    async map() {
      const { save } = need();
      return { ...readMap(save.main.data, save.revision), revisionLabel: save.revision.label };
    },

    async itemName(raw) {
      const { strings } = need();
      return strings.getItemName(new Item(BigInt(`0x${raw}`)));
    },

    async itemCatalog(lang) {
      const s = await loadStrings(lang);
      const out = [];
      for (let id = 0; id < s.items.length; id++) {
        const name = s.items[id]!;
        if (id === Item.NONE || id === Item.EXTENSION || name === "" || name === s.noneName) continue;
        out.push({ id, name, kind: getKind(id), sprite: getMenuIconSprite(id) });
      }
      return out;
    },
  };
}
