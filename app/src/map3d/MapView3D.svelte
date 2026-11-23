<script lang="ts">
  import { onMount } from "svelte";
  import type { MapData } from "@nhse/core";
  import type { SpriteSource } from "../map/spriteSource";
  import { createScene3D, type Scene3D } from "./scene3d";

  let { map, acreTiles, sprites, version = 0, structuresVersion = 0, terrainVersion = 0, onerror }: {
    map: MapData;
    acreTiles: Uint8Array;
    sprites: SpriteSource;
    version?: number;
    structuresVersion?: number;
    terrainVersion?: number;
    onerror: (message: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let scene: Scene3D | null = null;
  let ready = $state(false);
  let grid = false;

  onMount(() => {
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (w > 0 && h > 0) scene?.resize(w, h);
    });
    ro.observe(host);
    scene = createScene3D(canvas, { map, acreTiles, sprites, onError: onerror });
    scene.resize(host.clientWidth || 1, host.clientHeight || 1);
    ready = true;
    return () => { ro.disconnect(); scene?.dispose(); scene = null; };
  });

  $effect(() => { void terrainVersion; if (terrainVersion > 0) scene?.refreshTerrain(); });
  $effect(() => { void structuresVersion; if (structuresVersion > 0) scene?.refreshStructures(); });
  $effect(() => { void version; if (version > 0) scene?.refreshItems(); });
  $effect(() => { scene?.setSprites(sprites); });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "g" || e.key === "G") { grid = !grid; scene?.setGrid(grid); e.preventDefault(); return; }
    if (scene?.handleKey(e.key)) e.preventDefault();
  }
</script>

<div class="host" bind:this={host} data-testid="map3d-host" data-ready={ready ? "true" : "false"}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <canvas
    bind:this={canvas}
    data-testid="map3d-canvas"
    aria-label="3D island view. Drag to orbit, right-drag to pan, scroll to zoom, WASD or arrows to move, R and F to tilt, G for the acre grid."
    tabindex="0"
    onpointerdown={() => canvas.focus()}
    {onkeydown}
  ></canvas>
  <p class="hint">Drag: orbit · Right-drag: pan · Scroll: zoom · WASD: move · R/F: tilt · G: acre grid</p>
</div>

<style>
  .host { position: relative; flex: 1; min-height: 320px; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: #80d7c3; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
  .hint { position: absolute; left: 8px; bottom: 6px; margin: 0; font-size: 0.75rem; color: #10202a; background: rgb(255 255 255 / 0.6); padding: 2px 6px; border-radius: 4px; pointer-events: none; }
</style>
