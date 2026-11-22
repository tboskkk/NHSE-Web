<script lang="ts">
  import { buildingTypeName } from "@nhse/core";
  import { api } from "../lib/state.svelte";
  import type { Inspection } from "./inspect";

  let { info }: { info: Inspection | null } = $props();
  let names = $state<Record<string, string>>({});

  $effect(() => {
    for (const it of info?.items ?? []) {
      if (names[it.raw] !== undefined) continue;
      const raw = it.raw;
      api.itemName(raw).then((n) => (names[raw] = n), () => (names[raw] = `#${it.id}`));
    }
  });
</script>

<aside aria-label="Tile inspector" aria-live="polite">
  <h2>Inspector</h2>
  {#if !info || info.empty}
    <p class="muted">Hover over the island to inspect a tile.</p>
  {:else}
    {#if info.terrain}
      {@const t = info.terrain}
      <h3>Terrain ({t.x}, {t.y})</h3>
      <dl>
        <dt>Unit model</dt><dd>0x{t.unitModel.toString(16)}</dd>
        <dt>Variation / angle</dt><dd>{t.variation} / {t.angle}</dd>
        <dt>Road</dt><dd>{t.roadModel ? `0x${t.roadModel.toString(16)} (${t.roadVariation} / ${t.roadAngle})` : "none"}</dd>
        <dt>Elevation</dt><dd>{t.elevation}</dd>
      </dl>
    {/if}
    {#if info.items.length > 0}
      {#each info.items as it (it.layer)}
        <h3>Item layer {it.layer + 1} ({it.x}, {it.y})</h3>
        <p>{names[it.raw] ?? "…"} <span class="muted">· id {it.id}{it.count ? ` · count ${it.count}` : ""}</span></p>
        <p class="raw muted">{it.raw}</p>
      {/each}
    {:else}
      <p class="muted">No item here.</p>
    {/if}
    {#if info.building}
      <h3>Building</h3>
      <p>{buildingTypeName(info.building.type)} <span class="muted">· slot {info.building.index}</span></p>
    {/if}
  {/if}
</aside>

<style>
  aside { width: 100%; flex: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; overflow-y: auto; }
  h2 { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 6px; }
  h3 { font-size: 0.9rem; margin: 10px 0 4px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  p { margin: 2px 0; }
  .raw { font: 0.75rem ui-monospace, monospace; word-break: break-all; }
  @media (max-width: 640px) { aside { width: 100%; } }
</style>
