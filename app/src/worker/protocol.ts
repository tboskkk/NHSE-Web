import type { EditOp, SaveFiles } from "@nhse/core";

export type LoadResult = {
  island: string;
  revisionLabel: string;
  players: { index: number; name: string; directory: string }[];
  invalidHashes: { path: string; start: number }[];
};

export type ItemView = { raw: string; id: number; name: string; sprite: string; count: number; useCount: number; kind: string };

export type PlayerView = {
  index: number;
  name: string;
  townName: string;
  playerId: number;
  townId: number;
  wallet: number;
  bank: number;
  nookMiles: number;
  totalNookMiles: number;
  hotelTickets: number | null;
  pocketCount: number;
  bagCount: number;
  itemChestCount: number;
  slotCounts: { pocket: number; bag: number; itemChest: number };
  birthday: { month: number; day: number };
  profileFruit: number;
  pocket: ItemView[];
  bag: ItemView[];
  itemChest: ItemView[];
};

export type CatalogEntry = { id: number; name: string; kind: string; sprite: string };

export interface Api {
  load(files: SaveFiles, lang: string): Promise<LoadResult>;
  player(i: number): Promise<PlayerView>;
  edit(op: EditOp): Promise<{ change: string | null; history: string[] }>;
  undo(): Promise<string | null>;
  redo(): Promise<string | null>;
  /** Runs save() with a crypto.getRandomValues seed, then markSaved(). "all" also includes passthrough files. */
  build(mode: "changed" | "all"): Promise<SaveFiles>;
  originals(): Promise<SaveFiles>;
  itemCatalog(lang: string): Promise<CatalogEntry[]>;
}

export type Request = { id: number; method: keyof Api; args: unknown[] };
export type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
