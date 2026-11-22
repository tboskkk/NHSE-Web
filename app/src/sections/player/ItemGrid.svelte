<script lang="ts">
  import type { ItemArea } from "@nhse/core";
  import type { ItemView } from "../../worker/protocol";
  import ItemSlot from "./ItemSlot.svelte";

  let { items, area, unlocked, selectedSlot, virtual = false, onselect, onmenu, ondropped }: {
    items: ItemView[]; area: ItemArea; unlocked: number; selectedSlot: number | null; virtual?: boolean;
    onselect: (slot: number) => void; onmenu: (slot: number, x: number, y: number) => void;
    ondropped: (from: { area: ItemArea; slot: number }, to: number) => void;
  } = $props();

  const COLS = 10;
  const GAP = 4;
  let scroller = $state<HTMLDivElement>();
  let width = $state(600);
  let height = $state(400);
  let scrollTop = $state(0);

  const cell = $derived(Math.max(24, (width - GAP * (COLS - 1)) / COLS));
  const rowH = $derived(cell + GAP);
  const rows = $derived(Math.ceil(items.length / COLS));
  const first = $derived(virtual ? Math.max(0, Math.floor(scrollTop / rowH) - 2) : 0);
  const last = $derived(virtual ? Math.min(rows, Math.ceil((scrollTop + height) / rowH) + 2) : rows);
  const visible = $derived(Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i));
</script>

<div
  class="grid" class:virtual
  bind:this={scroller} bind:clientWidth={width} bind:clientHeight={height}
  onscroll={() => virtual && (scrollTop = scroller!.scrollTop)}
>
  <div class="spacer" style:height="{rows * rowH}px" style:--cell="{cell}px">
    {#each visible as r (r)}
      <div class="row" style:top="{r * rowH}px" style:height="{cell}px">
        {#each items.slice(r * COLS, r * COLS + COLS) as item, c (r * COLS + c)}
          {@const slot = r * COLS + c}
          <div class="cell" style:width="{cell}px">
            <ItemSlot
              {item} {area} {slot} locked={slot >= unlocked} selected={selectedSlot === slot}
              onselect={() => onselect(slot)}
              onmenu={(x, y) => onmenu(slot, x, y)}
              ondropped={(from) => ondropped(from, slot)}
            />
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .grid.virtual { max-height: 26rem; overflow-y: auto; }
  .spacer { position: relative; }
  .row { position: absolute; left: 0; right: 0; display: flex; gap: 4px; }
  .cell { flex: none; }
</style>
