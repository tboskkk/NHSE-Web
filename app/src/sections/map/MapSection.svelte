<script lang="ts">
  import { onMount } from "svelte";
  import { ITEM_COUNT } from "@nhse/core";
  import { fromZip } from "@nhse/io";
  import { api, app, showToast } from "../../lib/state.svelte";
  import type { MapView as MapData } from "../../worker/protocol";
  import { inspectTile, type Inspection } from "../../map/inspect";
  import { makeLayout } from "../../map/layout";
  import Inspector from "../../map/Inspector.svelte";
  import type { LayerId } from "../../map/scene";
  import { createSpriteSource } from "../../map/spriteSource";
  import { importPack, packStore } from "../../map/spritePack";

  const base = import.meta.env.BASE_URL;
  const LABELS: [LayerId, string][] = [["terrain", "Terrain"], ["items0", "Items (layer 1)"], ["items1", "Items (layer 2)"], ["buildings", "Buildings"], ["grid", "Acre grid"]];

  let map = $state.raw<MapData | null>(null);
  let acreTiles = $state.raw<Uint8Array | null>(null);
  let error = $state<string | null>(null);
  let layers = $state<Record<LayerId, boolean>>({ terrain: true, items0: true, items1: true, buildings: true, grid: false });
  let info = $state.raw<Inspection | null>(null);
  let packUrls = $state.raw(new Map<string, string>());
  let sprites = $derived(createSpriteSource(packUrls, ITEM_COUNT, base));
  let token = 0;

  // (Re)load whenever a different save is opened; the map is read-only so edits elsewhere never change it.
  $effect(() => {
    void app.loaded;
    const mine = ++token;
    map = null;
    info = null;
    error = null;
    Promise.all([
      api.map(),
      acreTiles ? Promise.resolve(acreTiles) : fetch(`${base}data/acretiles.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`acre templates failed to load (${r.status})`)))).then((b) => new Uint8Array(b)),
    ]).then(
      ([m, a]) => { if (mine === token) { acreTiles = a; map = m; } },
      (e) => { if (mine === token) error = e instanceof Error ? e.message : String(e); },
    );
  });

  function setPack(entries: Map<string, Uint8Array>) {
    for (const u of packUrls.values()) URL.revokeObjectURL(u);
    packUrls = new Map([...entries].map(([k, v]) => [k, URL.createObjectURL(new Blob([v as BlobPart], { type: "image/png" }))]));
  }

  onMount(() => {
    packStore.load().then((e) => { if (e.size) setPack(e); });
    return () => { for (const u of packUrls.values()) URL.revokeObjectURL(u); };
  });

  async function onpick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const list = Array.from(input.files ?? []);
    input.value = "";
    if (list.length === 0) return;
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      if (list.length === 1 && /\.zip$/i.test(list[0]!.name)) {
        for (const [name, data] of await fromZip(new Uint8Array(await list[0]!.arrayBuffer()))) files.push({ name, data });
      } else {
        for (const f of list) files.push({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, data: new Uint8Array(await f.arrayBuffer()) });
      }
      const { entries, skipped } = importPack(files);
      if (entries.size === 0) { showToast(`No sprites found (expected NNNNN_V.png files); ${skipped} file(s) skipped.`); return; }
      await packStore.save(entries);
      setPack(entries);
      showToast(`Imported ${entries.size} sprites${skipped ? ` (${skipped} skipped)` : ""}.`);
    } catch (err) {
      showToast(`Could not import sprites: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function clearPack() {
    await packStore.clear();
    setPack(new Map());
  }

  function onhover(h: { terrain: { x: number; y: number } | null; item: { x: number; y: number } | null } | null) {
    info = map && h ? inspectTile(map, makeLayout(map.items[0].width / 32), h.terrain, h.item) : null;
  }
</script>

<div class="map">
  <h1>Map <span class="muted">· read-only viewer</span></h1>
  <div class="bar">
    <fieldset>
      <legend class="visually-hidden">Layers</legend>
      {#each LABELS as [id, label] (id)}
        <label><input type="checkbox" bind:checked={layers[id]} /> {label}</label>
      {/each}
    </fieldset>
    <div class="pack">
      <span class="muted" data-testid="sprite-status">sprites: {packUrls.size} loaded</span>
      <label class="btn">Import folder<input type="file" webkitdirectory multiple hidden onchange={onpick} /></label>
      <label class="btn">Import .zip<input type="file" accept=".zip" hidden onchange={onpick} /></label>
      <button onclick={clearPack} disabled={packUrls.size === 0}>Clear</button>
    </div>
  </div>
  {#if error}
    <p class="err" role="alert">The map could not be shown: {error}. Nothing in your save was changed.</p>
  {:else if map && acreTiles}
    <div class="stage">
      {#await import("../../map/MapView.svelte")}
        <p class="muted">Loading map…</p>
      {:then { default: MapView }}
        {#key map}
          <MapView {map} {acreTiles} {sprites} {layers} {onhover} onerror={(m) => (error = m)} />
        {/key}
      {:catch e}
        <p class="err" role="alert">The map viewer could not be loaded: {e instanceof Error ? e.message : String(e)}</p>
      {/await}
      <Inspector {info} />
    </div>
  {:else}
    <p class="muted">Reading the island…</p>
  {/if}
</div>

<style>
  .map { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }
  h1 { margin: 0; font-size: 1.2rem; }
  .bar { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center; justify-content: space-between; }
  fieldset { display: flex; flex-wrap: wrap; gap: 4px 14px; border: 0; padding: 0; margin: 0; }
  .pack { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .btn { font: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 12px; cursor: pointer; }
  .btn:hover { background: var(--surface-2); }
  .stage { display: flex; gap: 12px; flex: 1; min-height: 0; }
  .err { color: var(--error); }
  @media (max-width: 640px) { .stage { flex-direction: column; } }
</style>
