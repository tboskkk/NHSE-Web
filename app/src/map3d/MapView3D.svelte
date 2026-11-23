<script lang="ts">
  import { onMount } from "svelte";
  import type { MapData } from "@nhse/core";
  import type { Ghost, LayerId } from "../map/scene";
  import type { SpriteSource } from "../map/spriteSource";
  import { createGestures, type PaintSink } from "./gestures";
  import type { Tile } from "./pick";
  import type { LoadedModels } from "./modelPack";
  import { createScene3D, type Scene3D } from "./scene3d";

  type Hover = { terrain: Tile | null; item: Tile | null } | null;
  let { map, acreTiles, sprites, layers, version = 0, structuresVersion = 0, terrainVersion = 0, paintGrid = "items", ghost = null, paint = null, models = null, onhover, onerror }: {
    map: MapData;
    acreTiles: Uint8Array;
    sprites: SpriteSource;
    layers: Record<LayerId, boolean>;
    version?: number;
    structuresVersion?: number;
    terrainVersion?: number;
    /** Which grid pointer tiles are reported in while painting: item tiles, or terrain tiles. */
    paintGrid?: "items" | "terrain";
    ghost?: Ghost | null;
    /** Edit-mode gesture sink; null in view mode. Left button / one finger paints, right-drag orbits, Space or middle button pans. */
    paint?: PaintSink | null;
    /** Imported natural-item models; null draws billboards only. */
    models?: LoadedModels | null;
    onhover?: (h: Hover) => void;
    onerror: (message: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let scene: Scene3D | null = null;
  let ready = $state(false);
  let spaceHeld = $state(false);
  let grid = false;

  const billboards = () => paintGrid === "items";
  const tileAt = (cx: number, cy: number): Tile | null => {
    const p = scene?.pick(cx, cy, { billboards: billboards() });
    return p ? (paintGrid === "items" ? p.item : p.terrain) : null;
  };
  // hover picking runs at most once per animation frame (a ray test walks every terrain triangle)
  let hoverAt: { x: number; y: number } | null = null;
  let hoverRaf = 0;
  function reportHover(cx: number, cy: number) {
    hoverAt = { x: cx, y: cy };
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (!hoverAt || !scene) return;
      const p = scene.pick(hoverAt.x, hoverAt.y, { billboards: billboards() });
      onhover?.(p && (p.item || p.terrain) ? { item: p.item, terrain: p.terrain } : null);
    });
  }
  const gestures = createGestures({ sink: () => paint, tileAt, spaceHeld: () => spaceHeld, onHover: reportHover });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (w > 0 && h > 0) scene?.resize(w, h);
    });
    ro.observe(host);
    scene = createScene3D(canvas, { map, acreTiles, sprites, onError: onerror });
    scene.resize(host.clientWidth || 1, host.clientHeight || 1);
    Object.assign(host, { projectTile: (x: number, y: number) => scene?.projectTile(x, y) ?? null });
    ready = true;
    return () => {
      gestures.cancel();
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      ro.disconnect();
      scene?.dispose();
      scene = null;
    };
  });

  $effect(() => { void terrainVersion; if (terrainVersion > 0) scene?.refreshTerrain(); });
  $effect(() => { void structuresVersion; if (structuresVersion > 0) scene?.refreshStructures(); });
  $effect(() => { void version; if (version > 0) scene?.refreshItems(); });
  $effect(() => { scene?.setSprites(sprites); });
  $effect(() => { scene?.setModels(models); });
  $effect(() => { scene?.setLayers({ ...layers }); });
  $effect(() => { scene?.setGhost(ghost); });
  $effect(() => { scene?.setEditing(paint !== null, spaceHeld); });

  function onpointerdown(e: PointerEvent) {
    canvas.focus();
    if (gestures.down({ id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY })) canvas.setPointerCapture(e.pointerId);
  }
  const onpointermove = (e: PointerEvent) => gestures.move({ id: e.pointerId, x: e.clientX, y: e.clientY });
  const onpointerup = (e: PointerEvent) => gestures.up({ id: e.pointerId, cancelled: e.type === "pointercancel" });
  function onkeydown(e: KeyboardEvent) {
    if (e.key === " ") { spaceHeld = true; e.preventDefault(); return; }
    if (e.key === "g" || e.key === "G") { grid = !grid; scene?.setGrid(grid); e.preventDefault(); return; }
    if (scene?.handleKey(e.key)) e.preventDefault();
  }
  const onkeyup = (e: KeyboardEvent) => { if (e.key === " ") spaceHeld = false; };
</script>

<div class="host" bind:this={host} data-testid="map3d-host" data-ready={ready ? "true" : "false"}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <canvas
    bind:this={canvas}
    data-testid="map3d-canvas"
    aria-label="3D island view. Drag to orbit, right-drag to pan, scroll to zoom, WASD or arrows to move, R and F to tilt, G for the acre grid. In edit mode left-click paints and right-drag orbits."
    tabindex="0"
    {onpointerdown} {onpointermove} {onpointerup} onpointercancel={onpointerup}
    onpointerleave={() => onhover?.(null)}
    oncontextmenu={(e) => { if (paint) e.preventDefault(); }}
    {onkeydown} {onkeyup}
  ></canvas>
  <p class="hint" data-testid="map3d-caption">
    {#if ghost?.label}{ghost.label}{:else if paint}Left-click: paint · Right-drag: orbit · Space-drag / middle-drag: pan · Scroll: zoom · WASD: move · R/F: tilt{:else}Drag: orbit · Right-drag: pan · Scroll: zoom · WASD: move · R/F: tilt · G: acre grid{/if}
  </p>
</div>

<style>
  .host { position: relative; flex: 1; min-height: 320px; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: #80d7c3; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
  .hint { position: absolute; left: 8px; bottom: 6px; margin: 0; font-size: 0.75rem; color: #10202a; background: rgb(255 255 255 / 0.6); padding: 2px 6px; border-radius: 4px; pointer-events: none; }
</style>
