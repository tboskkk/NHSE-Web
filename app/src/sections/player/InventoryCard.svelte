<script lang="ts">
  import type { EditOp, ItemArea } from "@nhse/core";
  import { edit, showToast } from "../../lib/state.svelte";
  import { AREA_LABEL, sel } from "../../lib/selection.svelte";
  import type { ItemView, PlayerView } from "../../worker/protocol";
  import ItemGrid from "./ItemGrid.svelte";
  import SlotMenu from "./SlotMenu.svelte";

  let { p }: { p: PlayerView } = $props();

  const NONE = "000000000000fffe";
  const COLS = 10;
  let menu = $state<{ area: ItemArea; slot: number; x: number; y: number } | null>(null);

  const items = (a: ItemArea): ItemView[] => p[a];
  const unlocked = (a: ItemArea) => (a === "pocket" ? p.pocketCount : a === "bag" ? p.bagCount : p.itemChestCount);
  const setOp = (area: ItemArea, slot: number, raw: string): EditOp => ({ op: "setItem", player: p.index, area, slot, raw });

  const move = (from: { area: ItemArea; slot: number }, to: { area: ItemArea; slot: number }) => {
    if (from.area === to.area && from.slot === to.slot) return;
    edit({ op: "moveItem", player: p.index, from, to });
  };

  const batch = (label: string, ops: EditOp[]) => ops.length && edit({ op: "batch", label, ops });

  function actions(area: ItemArea, slot: number) {
    const list = items(area);
    const it = list[slot]!;
    const name = it.name;
    return {
      clear: () => edit(setOp(area, slot, NONE)),
      duplicate: () => {
        const n = list.length;
        for (let k = 1; k < n; k++) {
          const t = (slot + k) % n;
          if (list[t]!.id === 0xfffe) { edit(setOp(area, t, it.raw)); return; }
        }
        showToast(`No empty ${AREA_LABEL[area].toLowerCase()} slot to duplicate into.`);
      },
      fillRow: () => {
        const row = Math.floor(slot / COLS);
        const ops: EditOp[] = [];
        for (let s = row * COLS; s < Math.min(list.length, (row + 1) * COLS); s++) if (list[s]!.raw !== it.raw) ops.push(setOp(area, s, it.raw));
        batch(`${AREA_LABEL[area]} row ${row + 1}: fill with ${name}`, ops);
      },
      fillAll: () => {
        const ops: EditOp[] = [];
        list.forEach((x, s) => { if (x.id === 0xfffe) ops.push(setOp(area, s, it.raw)); });
        batch(`${AREA_LABEL[area]}: fill ${ops.length} empty slots with ${name}`, ops);
      },
    };
  }
  const menuActions = $derived(menu ? actions(menu.area, menu.slot) : null);
  const AREAS: { area: ItemArea; title: string; virtual: boolean }[] = [
    { area: "pocket", title: "Pockets (slots 1–20)", virtual: false },
    { area: "bag", title: "Bag (slots 21–40)", virtual: false },
    { area: "itemChest", title: "Home storage", virtual: true },
  ];
</script>

<section class="card">
  <h2>Inventory</h2>
  <p class="muted note">Click a slot to choose an item. Drag slots to move or swap. Right-click or long-press for more. Dimmed slots are not unlocked yet, but stay editable.</p>
  {#each AREAS as a (a.area)}
    <h3>{a.title}</h3>
    <ItemGrid
      items={items(a.area)} area={a.area} unlocked={unlocked(a.area)} virtual={a.virtual}
      selectedSlot={sel.slot?.area === a.area ? sel.slot.slot : null}
      onselect={(slot) => (sel.slot = { area: a.area, slot })}
      onmenu={(slot, x, y) => (menu = { area: a.area, slot, x, y })}
      ondropped={(from, to) => move(from, { area: a.area, slot: to })}
    />
  {/each}
</section>

{#if menu && menuActions}
  <SlotMenu
    x={menu.x} y={menu.y} canClear={true}
    onclear={menuActions.clear} onduplicate={menuActions.duplicate}
    onfillrow={menuActions.fillRow} onfillall={menuActions.fillAll}
    onclose={() => (menu = null)}
  />
{/if}

<style>
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; }
  h2 { margin: 0 0 4px; font-size: 1rem; }
  h3 { margin: 14px 0 6px; font-size: 0.85rem; }
  .note { margin: 0; font-size: 0.8rem; }
</style>
