import type { EditOp, MapData, SaveFiles } from "@nhse/core";

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

export type MapView = MapData & { revisionLabel: string };

/** A field item layer tile that changed: column-major index and its new raw (16 hex). */
export type Touched = { layer: 0 | 1; index: number; raw: string };
export type EditResult = { change: string | null; history: string[]; touched: Touched[] };
export type HistoryResult = { label: string | null; touched: Touched[] };

type Tile = { x: number; y: number };
export type PlanRequest =
  | { tool: "place"; layer: 0 | 1; tiles: Tile[]; raw: string }
  | { tool: "erase"; layer: 0 | 1; tiles: Tile[] }
  | { tool: "rect"; layer: 0 | 1; rect: { x0: number; y0: number; x1: number; y1: number }; raw: string | null }
  | { tool: "replaceAll"; layer: 0 | 1 | "both"; from: string; to: string; match: "id" | "exact" }
  | { tool: "removeItem"; layer: 0 | 1 | "both"; id: number }
  | { tool: "removeWeeds"; layer: 0 | 1 | "both" };
export type PlanResult = {
  /** Apply with edit(); null when nothing would change. */
  op: EditOp | null;
  counts: { placed: number; erased: number; replaced: number };
  skipped: number;
  sample: { x: number; y: number; reason: string }[];
};

export type CatalogEntry = { id: number; name: string; kind: string; sprite: string };

export interface Api {
  load(files: SaveFiles, lang: string): Promise<LoadResult>;
  player(i: number): Promise<PlayerView>;
  edit(op: EditOp): Promise<EditResult>;
  undo(): Promise<HistoryResult>;
  redo(): Promise<HistoryResult>;
  /**
   * Runs save() with a crypto.getRandomValues seed. "changed" = pairs edited since the last commit() plus any
   * pairs that loaded with invalid hashes; "all" also includes passthrough files. Never resets the changed set:
   * call commit() only after the files were durably written (a zip download does not count).
   */
  build(mode: "changed" | "all"): Promise<SaveFiles>;
  /** Declares the current bytes written to the destination folder: resets the changed set. */
  commit(): Promise<void>;
  /** Island and player names as currently stored (they change with renames). */
  summary(): Promise<Pick<LoadResult, "island" | "players">>;
  originals(): Promise<SaveFiles>;
  itemCatalog(lang: string): Promise<CatalogEntry[]>;
  /** Read-only snapshot of the island map (fresh copies each call; never marks the save dirty). */
  map(): Promise<MapView>;
  /** Plans a map tool gesture or bulk action against the current save; never edits. */
  mapPlan(req: PlanRequest): Promise<PlanResult>;
  /** Display name for a 16-digit hex raw item value in the loaded language. */
  itemName(raw: string): Promise<string>;
}

export type Request = { id: number; method: keyof Api; args: unknown[] };
export type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
