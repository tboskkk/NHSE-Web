<script lang="ts">
  import { classifyUnit, type MapData, type TerrainTileValue } from "@nhse/core";
  import type { StampPart, TerrainMode } from "./terrainTool";

  let { mode = $bindable(), delta = $bindable(), part = $bindable(), picked = $bindable() }: {
    map: MapData;
    version: number;
    mode: TerrainMode;
    delta: 1 | -1;
    part: StampPart;
    /** Tile copied by Stamp, or null until one is clicked on the map. */
    picked: TerrainTileValue | null;
  } = $props();

  const MODES: { id: string; label: string; set: () => void; on: boolean }[] = $derived([
    { id: "stamp", label: "Stamp", set: () => (mode = "stamp"), on: mode === "stamp" },
    { id: "raise", label: "Raise", set: () => { mode = "elevation"; delta = 1; }, on: mode === "elevation" && delta === 1 },
    { id: "lower", label: "Lower", set: () => { mode = "elevation"; delta = -1; }, on: mode === "elevation" && delta === -1 },
    { id: "rotate", label: "Rotate", set: () => (mode = "rotate"), on: mode === "rotate" },
    { id: "clearRoad", label: "Clear road", set: () => (mode = "clearRoad"), on: mode === "clearRoad" },
  ]);
  const PARTS: [StampPart, string][] = [["ground", "Ground"], ["road", "Road"], ["both", "Both"]];
</script>

<section class="panel" aria-label="Terrain">
  <h2>Terrain</h2>
  <div class="seg" role="group" aria-label="Terrain tool">
    {#each MODES as m (m.id)}
      <button data-testid="terrain-mode-{m.id}" class:on={m.on} aria-pressed={m.on} onclick={m.set}>{m.label}</button>
    {/each}
  </div>
  {#if mode === "stamp"}
    <div class="seg" role="group" aria-label="Stamp part">
      {#each PARTS as [id, label] (id)}
        <button data-testid="terrain-part-{id}" class:on={part === id} aria-pressed={part === id} onclick={() => (part = id)}>{label}</button>
      {/each}
    </div>
    {#if picked}
      <dl data-testid="terrain-picked">
        <dt>Ground</dt><dd>{classifyUnit(picked.unitModel)} {picked.unitModel} / {picked.variation} / {picked.angle}</dd>
        <dt>Road</dt><dd>{picked.roadModel} / {picked.roadVariation} / {picked.roadAngle}</dd>
        <dt>Elevation</dt><dd>{picked.elevation}</dd>
      </dl>
      <button data-testid="terrain-repick" onclick={() => (picked = null)}>Pick another tile</button>
    {:else}
      <p class="muted">Click a terrain tile on the map to pick it, then paint it elsewhere.</p>
    {/if}
  {/if}
  <p class="muted">Only combinations seen in real saves can be placed, and only on tiles in free (not fixed) acres.</p>
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 6px; }
  h2 { margin: 0; font-size: 1rem; }
  .seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .seg button { border: 0; border-radius: 0; }
  .seg button.on { background: var(--accent); color: var(--accent-text); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0; font-size: 0.85rem; }
  dt { color: var(--muted, inherit); }
  dd { margin: 0; }
</style>
