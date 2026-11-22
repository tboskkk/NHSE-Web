import {
  applyOp, describeOp, EditSession, GameStrings, getKind, getMenuIconSprite, HorizonSave, Item,
  type ItemArea, type SaveFiles,
} from "@nhse/core";
import type { Api, ItemView, PlayerView } from "./protocol";

const clone = (files: SaveFiles): SaveFiles => new Map([...files].map(([k, v]) => [k, v.slice()]));
const hex16 = (raw: bigint) => raw.toString(16).padStart(16, "0");

export function createApi(fetcher: (path: string) => Promise<unknown>): Api {
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
      const label = describeOp(save, strings, op);
      const change = session.apply(label, (s) => applyOp(s, op));
      return { change: change ? change.label : null, history: session.changes.map((c) => c.label) };
    },

    async undo() {
      return need().session.undo()?.label ?? null;
    },
    async redo() {
      return need().session.redo()?.label ?? null;
    },

    async build(mode) {
      const { save, session } = need();
      const only = mode === "changed" ? new Set([...session.dirtyPairs(), ...forced]) : undefined;
      if (only && only.size === 0) return new Map();
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
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
