import { GameStrings } from "@nhse/core";
import { api } from "./state.svelte";
import type { CatalogEntry } from "../worker/protocol";

const base = import.meta.env.BASE_URL;
const strings = new Map<string, Promise<GameStrings>>();
const catalogs = new Map<string, Promise<CatalogEntry[]>>();

/** Main-thread copy of the localized text (remake / recipe / fossil names); the worker keeps its own. */
export function loadStrings(lang: string): Promise<GameStrings> {
  let p = strings.get(lang);
  if (!p) strings.set(lang, (p = GameStrings.load(lang, async (path) => (await fetch(`${base}${path}`)).json())));
  return p;
}

export function loadCatalog(lang: string): Promise<CatalogEntry[]> {
  let p = catalogs.get(lang);
  if (!p) catalogs.set(lang, (p = api.itemCatalog(lang)));
  return p;
}
