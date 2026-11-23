<script lang="ts">
  import { onMount } from "svelte";
  import { BUILDING_ITEM_TILES, checkPlacement, footprintTiles, isNone, itemFootprint, itemToWorld, Item, ITEM_COUNT, rootOf, TERRAIN_ORIGIN_TILES, type TerrainEditOp, type TerrainTileValue } from "@nhse/core";
  import { fromZip } from "@nhse/io";
  import { api, app, edit, onMapTouched, onStructuresTouched, onTerrainTouched, showToast } from "../../lib/state.svelte";
  import type { MapView as MapData } from "../../worker/protocol";
  import { inspectTile, type Inspection } from "../../map/inspect";
  import { makeLayout } from "../../map/layout";
  import Inspector from "../../map/Inspector.svelte";
  import BulkPanel from "../../map/BulkPanel.svelte";
  import BuildingPanel from "../../map/BuildingPanel.svelte";
  import TerrainPanel from "../../map/TerrainPanel.svelte";
  import { clearRoadOp, elevationOp, keepPlannable, rotateOp, stampOp, terrainTileUnder, type StampPart, type TerrainMode } from "../../map/terrainTool";
  import { addOp, hitTarget, moveOp, reconcileSelection, targetRect, type Target } from "../../map/buildingTool";
  import MapBrush from "../../map/MapBrush.svelte";
  import MapToolbar from "../../map/MapToolbar.svelte";
  import { createMapStore, type MapStore } from "../../map/mapStore";
  import type { Ghost, LayerId } from "../../map/scene";
  import { createStroke, type Stroke, type Tool } from "../../map/tools";
  import { createSpriteSource } from "../../map/spriteSource";
  import { importPack, packStore } from "../../map/spritePack";
  import { isModelPack, type LoadedModels, modelPackStore, parseModelPack } from "../../map3d/modelPack";

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
  let models = $state.raw<LoadedModels | null>(null);

  // ---- edit mode ----
  let mode = $state<"view" | "edit">("view");
  let editLayer = $state<0 | 1>(0);
  let tool = $state<Tool>("place");
  let brush = $state<bigint>(0xfffen);
  let store = $state.raw<MapStore | null>(null);
  let version = $state(0);
  let structuresVersion = $state(0);
  let terrainVersion = $state(0);
  let hoverItem = $state.raw<{ x: number; y: number } | null>(null);
  let stroke: Stroke | null = null;
  let strokeTick = $state(0);
  let status = $state("");
  const blocked = $derived((app.loaded?.invalidHashes.length ?? 0) > 0 && !app.hashWarningDismissed ? "Dismiss the hash warning above to enable editing." : null);
  let view = $state<"2d" | "3d">("2d");
  let error3d = $state<string | null>(null);
  const editing = $derived(mode === "edit" && blocked === null);
  // building tool: selection, drag and add-mode state (raw: ops are posted to the worker)
  let selected = $state.raw<Target | null>(null);
  let addType = $state<number | null>(null);
  let drag = $state.raw<{ target: Target; grab: { x: number; y: number }; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  let probe = $state.raw<{ key: string; ok: boolean; reason?: string } | null>(null);
  let probeToken = 0;
  // terrain tool: mode, picked tile, hover (terrain tile coordinates) and the ghost's validity probe
  let tmode = $state<TerrainMode>("stamp");
  let tdelta = $state<1 | -1>(1);
  let tpart = $state<StampPart>("ground");
  let picked = $state.raw<TerrainTileValue | null>(null);
  let hoverTerrain = $state.raw<{ x: number; y: number } | null>(null);
  let tprobe = $state.raw<{ key: string; ok: boolean; reason?: string } | null>(null);
  let tprobeToken = 0;
  let tstroke: Stroke | null = null;
  const acreW = $derived(map ? map.items[0].width / 32 : 9);
  const brushName = $derived(brush === 0xfffen ? "nothing" : new Item(brush).itemId.toString());

  $effect(() => { if (blocked) mode = "view"; });
  $effect(() => {
    void app.loadEpoch;
    mode = "view";
  });
  $effect(() => {
    if (!store) return;
    const s = store;
    const off = s.subscribe((v) => { version = v; structuresVersion = s.structuresVersion; terrainVersion = s.terrainVersion; });
    const offTouched = onMapTouched((t) => s.patch(t));
    const offStruct = onStructuresTouched((st) => s.patchStructures(st));
    const offTerrain = onTerrainTouched((t) => s.patchTerrain(t));
    return () => { off(); offTouched(); offStruct(); offTerrain(); };
  });

  $effect(() => { if (tool !== "building") { selected = null; addType = null; drag = null; } });
  // undo/redo patch buildings in place, so drop a selection whose slot was emptied
  $effect(() => {
    void version;
    const st = store;
    if (st && selected) { const r = reconcileSelection(st.map, selected); if (r !== selected) selected = r; }
  });

  /** The building op the pointer is currently proposing (drag or add), with its footprint in item coordinates. */
  const candidate = $derived.by(() => {
    void version;
    const st = store;
    if (!editing || tool !== "building" || !st) return null;
    if (drag) {
      const r = targetRect(st.map, acreW, drag.target);
      return { op: moveOp(st.map, acreW, drag.target, drag.to), rect: { x: drag.to.x, y: drag.to.y, w: r.w, h: r.h } };
    }
    if (addType !== null && hoverItem) {
      const op = addOp(st.map, acreW, addType, hoverItem);
      return op ? { op, rect: { x: hoverItem.x, y: hoverItem.y, w: BUILDING_ITEM_TILES, h: BUILDING_ITEM_TILES } } : null;
    }
    return null;
  });
  $effect(() => {
    const c = candidate;
    const mine = ++probeToken;
    if (!c) { probe = null; return; }
    const key = JSON.stringify(c.op);
    void api.buildingPlan(c.op).then((r) => { if (mine === probeToken) probe = r.ok ? { key, ok: true } : { key, ok: false, reason: r.reason }; });
  });

  const terrainOpFor = (tiles: { x: number; y: number }[]): TerrainEditOp | null => {
    const m = store?.map;
    if (!m) return null;
    switch (tmode) {
      case "stamp": return picked ? stampOp(m, picked, tpart, tiles) : null;
      case "elevation": return elevationOp(m, tiles, tdelta);
      case "rotate": return rotateOp(m, tiles);
      case "clearRoad": return clearRoadOp(m, tiles);
    }
  };
  /** Item-layer rect of one terrain tile (2x2 item tiles). */
  const terrainRect = (t: { x: number; y: number }) => {
    const o = itemToWorld(acreW, 0, 0);
    return { x: 2 * (t.x + TERRAIN_ORIGIN_TILES) - o.x, y: 2 * (t.y + TERRAIN_ORIGIN_TILES) - o.y, w: 2, h: 2 };
  };
  const terrainCandidate = $derived.by(() => {
    void version;
    if (!editing || tool !== "terrain" || !hoverTerrain) return null;
    const op = terrainOpFor([hoverTerrain]);
    return op ? { op, rect: terrainRect(hoverTerrain) } : null;
  });
  $effect(() => {
    const c = terrainCandidate;
    const mine = ++tprobeToken;
    if (!c || c.op.changes.length === 0) { tprobe = null; return; }
    const key = JSON.stringify(c.op);
    void api.terrainPlan(c.op).then((r) => { if (mine === tprobeToken) tprobe = r.ok ? { key, ok: true } : { key, ok: false, reason: r.reason }; });
  });

  async function commitTerrain(op: TerrainEditOp) {
    if (op.changes.length === 0) { showToast("Nothing to change."); return; }
    try {
      // drop tiles the strict rules refuse so one bad tile does not cancel the whole drag
      const { op: good, skipped, reason } = await keepPlannable(op, (o) => api.terrainPlan(o));
      if (good.changes.length === 0) { showToast(reason ?? "Nothing to change."); return; }
      const r = await api.terrainPlan(good);
      if (!r.ok) { showToast(r.reason); return; }
      await edit(good);
      if (skipped) status = `skipped ${skipped} tile${skipped === 1 ? "" : "s"} (${reason})`;
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  }

  const terrainPaint = {
    start(t: { x: number; y: number }) {
      if (tmode === "stamp" && !picked) {
        picked = store ? terrainTileUnder(store.map, t) : null;
        return;
      }
      tstroke = createStroke("place", 0);
      tstroke.add(t.x, t.y);
    },
    move(t: { x: number; y: number }) { tstroke?.add(t.x, t.y); },
    end() {
      const r = tstroke?.done();
      tstroke = null;
      if (!r) return;
      const op = terrainOpFor(r.tiles);
      if (op) void commitTerrain(op);
    },
    cancel() { tstroke = null; },
  };

  const placeCtx = () => (store && acreTiles ? { map: store.map, acreTiles } : null);

  const ghost = $derived.by<Ghost | null>(() => {
    void version; void strokeTick;
    const ctx = placeCtx();
    if (!editing || !ctx) return null;
    if (stroke && (tool === "rect" || tool === "clearRect")) {
      const r = stroke.rect();
      return r ? { x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1, ok: tool === "rect" } : null;
    }
    if (tool === "terrain") {
      const c = terrainCandidate;
      if (c) {
        const p = tprobe && tprobe.key === JSON.stringify(c.op) ? tprobe : null;
        return { ...c.rect, ok: c.op.changes.length > 0 && (p ? p.ok : true), label: c.op.changes.length === 0 ? "nothing to change" : p?.reason };
      }
      if (tool === "terrain" && tmode === "stamp" && !picked && hoverTerrain) return { ...terrainRect(hoverTerrain), ok: true, label: "click to pick" };
      return null;
    }
    if (tool === "building") {
      const c = candidate;
      if (c) {
        const p = probe && probe.key === JSON.stringify(c.op) ? probe : null;
        return { ...c.rect, ok: p ? p.ok : true, label: p?.reason };
      }
      if (selected && ctx) return { ...targetRect(ctx.map, acreW, selected), ok: true };
      return null;
    }
    const h = hoverItem;
    if (!h) return null;
    if (tool === "place") {
      if (isNone(brush)) return null;
      const fp = itemFootprint(brush);
      const why = checkPlacement(ctx, editLayer, h.x, h.y, brush);
      return { x: h.x, y: h.y, w: fp.w, h: fp.h, ok: why === null, label: why ?? undefined };
    }
    const r = rootOf(ctx.map, editLayer, h.x, h.y);
    if (tool === "erase" || tool === "eyedropper") {
      if (!r) return null;
      const fp = itemFootprint(r.raw);
      return { x: r.x, y: r.y, w: fp.w, h: fp.h, ok: tool === "eyedropper" };
    }
    return { x: h.x, y: h.y, w: 1, h: 1, ok: true };
  });
  $effect(() => { status = ghost && !ghost.ok && ghost.label ? `Cannot ${tool === "building" ? "move or add" : tool === "terrain" ? "edit terrain" : "place"} here: ${ghost.label}` : ""; });

  async function finish(r: NonNullable<ReturnType<Stroke["done"]>>) {
    const ctx = placeCtx();
    if (!ctx) return;
    if (r.tool === "eyedropper") {
      const t = r.tiles[0]!;
      const root = rootOf(ctx.map, r.layer, t.x, t.y);
      if (root) { brush = root.raw; tool = "place"; }
      return;
    }
    try {
      const hex = (b: bigint) => b.toString(16).padStart(16, "0");
      const plan = r.tool === "place"
        ? await api.mapPlan({ tool: "place", layer: r.layer, tiles: r.tiles, raw: hex(brush) })
        : r.tool === "erase"
          ? await api.mapPlan({ tool: "erase", layer: r.layer, tiles: r.tiles })
          : await api.mapPlan({ tool: "rect", layer: r.layer, rect: r.rect!, raw: r.tool === "rect" ? hex(brush) : null });
      if (!plan.op) {
        showToast(plan.skipped ? `Nothing changed (${plan.skipped} skipped: ${plan.sample[0]?.reason}).` : "Nothing to change.");
        return;
      }
      await edit(plan.op);
      const c = plan.counts;
      const did = [c.placed && `placed ${c.placed}`, c.erased && `removed ${c.erased}`].filter(Boolean).join(", ");
      status = `${did}${plan.skipped ? `, skipped ${plan.skipped} (${plan.sample[0]?.reason})` : ""}`;
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  }

  async function commitBuilding(op: NonNullable<typeof candidate>["op"]) {
    try {
      const r = await api.buildingPlan(op);
      if (!r.ok) { showToast(r.reason); return; }
      await edit(op);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  }

  const buildingPaint = {
    start(t: { x: number; y: number }) {
      if (!store) return;
      if (addType !== null) {
        const op = addOp(store.map, acreW, addType, t);
        if (!op) { showToast("All 46 building slots are in use."); addType = null; return; }
        addType = null;
        void commitBuilding(op);
        return;
      }
      const hit = hitTarget(store.map, acreW, t);
      selected = hit;
      if (hit) {
        const r = targetRect(store.map, acreW, hit);
        drag = { target: hit, grab: { x: t.x - r.x, y: t.y - r.y }, from: { x: r.x, y: r.y }, to: { x: r.x, y: r.y } };
      }
    },
    move(t: { x: number; y: number }) {
      if (drag) drag = { ...drag, to: { x: t.x - drag.grab.x, y: t.y - drag.grab.y } };
    },
    end() {
      const d = drag;
      drag = null;
      if (!d || !store || (d.to.x === d.from.x && d.to.y === d.from.y)) return;
      void commitBuilding(moveOp(store.map, acreW, d.target, d.to));
    },
    cancel() { drag = null; },
  };

  const paint = $derived(
    editing && tool === "building"
      ? buildingPaint
      : editing && tool === "terrain"
      ? terrainPaint
      : editing
      ? {
          start(t: { x: number; y: number }) {
            if ((tool === "place" || tool === "rect") && isNone(brush)) { showToast("Pick a brush item first."); return; }
            stroke = createStroke(tool, editLayer, tool === "place" && !isNone(brush) ? itemFootprint(brush) : undefined);
            stroke.add(t.x, t.y);
            strokeTick++;
          },
          move(t: { x: number; y: number }) { if (stroke) { stroke.add(t.x, t.y); strokeTick++; } },
          end() {
            const r = stroke?.done();
            stroke = null;
            strokeTick++;
            if (r) void finish(r);
          },
          cancel() { stroke = null; strokeTick++; },
        }
      : null,
  );

  function onkey(e: KeyboardEvent) {
    if (!editing || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.matches?.("input, textarea, select, [contenteditable]")) return;
    const k = ({ p: "place", e: "erase", r: "rect", c: "clearRect", i: "eyedropper", b: "building", t: "terrain" } as Record<string, Tool>)[e.key.toLowerCase()];
    if (k) tool = k;
  }

  // (Re)load whenever a different save is opened; the map is read-only so edits elsewhere never change it.
  $effect(() => {
    void app.loadEpoch;
    const mine = ++token;
    map = null;
    store = null;
    info = null;
    error = null;
    Promise.all([
      api.map(),
      acreTiles ? Promise.resolve(acreTiles) : fetch(`${base}data/acretiles.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`acre templates failed to load (${r.status})`)))).then((b) => new Uint8Array(b)),
    ]).then(
      ([m, a]) => { if (mine === token) { acreTiles = a; map = m; store = createMapStore(m); version = 0; structuresVersion = 0; terrainVersion = 0; selected = null; drag = null; addType = null; } },
      (e) => { if (mine === token) error = e instanceof Error ? e.message : String(e); },
    );
  });

  function setPack(entries: Map<string, Uint8Array>) {
    for (const u of packUrls.values()) URL.revokeObjectURL(u);
    packUrls = new Map([...entries].map(([k, v]) => [k, URL.createObjectURL(new Blob([v as BlobPart], { type: "image/png" }))]));
  }

  onMount(() => {
    packStore.load().then((e) => { if (e.size) setPack(e); });
    modelPackStore.load().then((e) => { if (e.size) restoreModels([...e].map(([name, data]) => ({ name, data }))); });
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
      if (isModelPack(files)) {
        const r = parseModelPack(files);
        if (r.models.size === 0) { showToast(`The model pack has no usable models (${r.skipped} skipped).`); return; }
        await modelPackStore.save(new Map(files.map((f) => [f.name, f.data])));
        models = r;
        showToast(`Imported ${r.models.size} models${r.skipped ? ` (${r.skipped} skipped)` : ""}.`);
        return;
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

  function restoreModels(files: { name: string; data: Uint8Array }[]) {
    try { models = parseModelPack(files); } catch { models = null; }
  }

  async function clearPack() {
    await packStore.clear();
    await modelPackStore.clear();
    models = null;
    setPack(new Map());
  }

  function onhover(h: { terrain: { x: number; y: number } | null; item: { x: number; y: number } | null } | null) {
    hoverItem = h?.item ?? null;
    hoverTerrain = h?.terrain ?? null;
    info = map && h ? inspectTile(map, makeLayout(map.items[0].width / 32), h.terrain, h.item) : null;
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="map">
  <h1>Map <span class="muted">· {editing ? (tool === "building" ? "editing buildings" : tool === "terrain" ? "editing terrain" : "editing items") : "viewer"}</span></h1>
  <MapToolbar bind:mode bind:layer={editLayer} bind:tool {blocked} />
  <div class="seg" role="group" aria-label="View">
    <button data-testid="view2d" class:on={view === "2d"} aria-pressed={view === "2d"} onclick={() => { view = "2d"; error3d = null; }}>2D</button>
    <button data-testid="view3d" class:on={view === "3d"} aria-pressed={view === "3d"} onclick={() => (view = "3d")}>3D</button>
  </div>
  <div class="bar">
    <fieldset>
      <legend class="visually-hidden">Layers</legend>
      {#each LABELS as [id, label] (id)}
        <label><input type="checkbox" bind:checked={layers[id]} /> {label}</label>
      {/each}
    </fieldset>
    <div class="pack">
      <span class="muted" data-testid="sprite-status">sprites: {packUrls.size} loaded</span>
      <span class="muted" data-testid="model-status">models: {models?.models.size ?? 0} loaded</span>
      <label class="btn">Import folder<input type="file" webkitdirectory multiple hidden onchange={onpick} /></label>
      <label class="btn">Import .zip<input type="file" accept=".zip" hidden onchange={onpick} /></label>
      <button onclick={clearPack} disabled={packUrls.size === 0 && !models}>Clear</button>
    </div>
  </div>
  {#if error}
    <p class="err" role="alert">The map could not be shown: {error}. Nothing in your save was changed.</p>
  {:else if map && acreTiles}
    <div class="stage">
      {#if view === "3d"}
        {#if error3d}
          <div class="err" role="alert">
            <p>The 3D view could not be shown: {error3d}. Nothing in your save was changed.</p>
            <button onclick={() => { view = "2d"; error3d = null; }}>Back to 2D</button>
          </div>
        {:else}
          {#await import("../../map3d/MapView3D.svelte")}
            <p class="muted">Loading 3D view…</p>
          {:then { default: MapView3D }}
            {#key map}
              <MapView3D {map} {acreTiles} {sprites} {layers} {version} {structuresVersion} {terrainVersion} paintGrid={tool === "terrain" ? "terrain" : "items"} {ghost} {paint} {models} {onhover} onerror={(m) => (error3d = m)} />
            {/key}
          {:catch e}
            <p class="err" role="alert">The 3D view could not be loaded: {e instanceof Error ? e.message : String(e)}</p>
          {/await}
        {/if}
      {:else}
      {#await import("../../map/MapView.svelte")}
        <p class="muted">Loading map…</p>
      {:then { default: MapView }}
        {#key map}
          <MapView {map} {acreTiles} {sprites} {layers} {version} {structuresVersion} {terrainVersion} paintGrid={tool === "terrain" ? "terrain" : "items"} {ghost} {paint} dim={editing ? (editLayer === 0 ? "items1" : "items0") : null} {onhover} onerror={(m) => (error = m)} />
        {/key}
      {:catch e}
        <p class="err" role="alert">The map viewer could not be loaded: {e instanceof Error ? e.message : String(e)}</p>
      {/await}
      {/if}
      <div class="side">
        {#if editing && tool === "building" && store}
          <BuildingPanel map={store.map} {version} {acreW} bind:selected bind:addType />
          <p class="status" data-testid="map-status" role="status">{status}</p>
        {:else if editing && tool === "terrain" && store}
          <TerrainPanel map={store.map} {version} bind:mode={tmode} bind:delta={tdelta} bind:part={tpart} bind:picked />
          <p class="status" data-testid="map-status" role="status">{status}</p>
        {:else if editing}
          <MapBrush bind:raw={brush} />
          <BulkPanel {brush} {brushName} />
          <p class="status" data-testid="map-status" role="status">{status}</p>
        {/if}
        <Inspector {info} />
      </div>
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
  .side { display: flex; flex-direction: column; gap: 12px; width: 15rem; flex: none; overflow-y: auto; }
  .status { margin: 0; min-height: 1.2em; font-size: 0.85rem; }
  .err { color: var(--error); }
  .seg { display: inline-flex; align-self: flex-start; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .seg button { border: 0; border-radius: 0; }
  .seg button.on { background: var(--accent); color: var(--accent-text); }
  @media (max-width: 640px) { .stage { flex-direction: column; } }
</style>
