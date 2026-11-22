import type { ItemArea } from "@nhse/core";

export const AREA_LABEL: Record<ItemArea, string> = { pocket: "Pocket", bag: "Bag", itemChest: "Storage" };

/** The slot the item picker is editing (null = closed). */
export const sel = $state({ slot: null as { area: ItemArea; slot: number } | null });
