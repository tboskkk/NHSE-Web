<script lang="ts">
  import { onMount } from "svelte";
  import { buildingTypeName, type MapData } from "@nhse/core";
  import { type Camera, MAX_ZOOM, MIN_ZOOM, panBy, zoomAt } from "./camera";
  import { WORLD_PX } from "./layout";
  import { createMapScene, type LayerId, type MapScene } from "./scene";
  import type { SpriteSource } from "./spriteSource";
  import { screenToTile } from "./tiles";

  type Hover = { terrain: { x: number; y: number } | null; item: { x: number; y: number } | null } | null;
  let { map, acreTiles, sprites, layers, onhover, onerror }: {
    map: MapData;
    acreTiles: Uint8Array;
    sprites: SpriteSource;
    layers: Record<LayerId, boolean>;
    onhover: (h: Hover) => void;
    onerror: (message: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let scene: MapScene | null = null;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let view = { w: 0, h: 0 };
  let ready = $state(false);
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const set = (c: Camera) => { camera = c; scene?.setCamera(c); };
  const fit = () => {
    const zoom = Math.min(Math.max(Math.min(view.w / WORLD_PX.w, view.h / WORLD_PX.h), MIN_ZOOM), MAX_ZOOM);
    set({ x: (WORLD_PX.w - view.w / zoom) / 2, y: (WORLD_PX.h - view.h / zoom) / 2, zoom });
  };

  onMount(() => {
    let alive = true;
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!(w > 0 && h > 0)) return;
      const first = view.w === 0;
      view = { w, h };
      scene?.resize(w, h);
      if (first) fit(); else set(camera);
    });
    ro.observe(host);
    view = { w: host.clientWidth, h: host.clientHeight };
    createMapScene(canvas, map, { acreTiles, sprites, buildingName: buildingTypeName }).then(
      (s) => {
        if (!alive) { s.destroy(); return; }
        scene = s;
        for (const id of Object.keys(layers) as LayerId[]) s.setLayerVisible(id, layers[id]);
        s.resize(view.w, view.h);
        fit();
        ready = true;
      },
      (e) => onerror(e instanceof Error ? e.message : String(e)),
    );
    return () => { alive = false; ro.disconnect(); scene?.destroy(); scene = null; };
  });

  $effect(() => { for (const id of Object.keys(layers) as LayerId[]) scene?.setLayerVisible(id, layers[id]); });
  $effect(() => { scene?.setSprites(sprites); });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function hoverAt(sx: number, sy: number) {
    if (!scene) return;
    const l = scene.layout;
    const terrain = screenToTile(camera, sx, sy, l.terrain);
    const item = screenToTile(camera, sx, sy, l.items);
    onhover(terrain || item ? { terrain, item } : null);
  }

  function onpointerdown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    pinch = 0;
  }
  function onpointermove(e: PointerEvent) {
    const p = local(e);
    const prev = pointers.get(e.pointerId);
    if (!prev) { hoverAt(p.x, p.y); return; }
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) set(panBy(camera, p.x - prev.x, p.y - prev.y, WORLD_PX, view));
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0 && d > 0) set(zoomAt(camera, d / pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2, WORLD_PX, view));
      pinch = d;
    }
  }
  function onpointerup(e: PointerEvent) { pointers.delete(e.pointerId); pinch = 0; }
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    set(zoomAt(camera, Math.exp(-e.deltaY * 0.0015), p.x, p.y, WORLD_PX, view));
  }
  function onkeydown(e: KeyboardEvent) {
    const step = 80;
    const k = e.key;
    if (k === "ArrowLeft") set(panBy(camera, step, 0, WORLD_PX, view));
    else if (k === "ArrowRight") set(panBy(camera, -step, 0, WORLD_PX, view));
    else if (k === "ArrowUp") set(panBy(camera, 0, step, WORLD_PX, view));
    else if (k === "ArrowDown") set(panBy(camera, 0, -step, WORLD_PX, view));
    else if (k === "+" || k === "=") set(zoomAt(camera, 1.25, view.w / 2, view.h / 2, WORLD_PX, view));
    else if (k === "-" || k === "_") set(zoomAt(camera, 0.8, view.w / 2, view.h / 2, WORLD_PX, view));
    else return;
    e.preventDefault();
  }
</script>

<div class="host" bind:this={host} data-testid="map-host" data-ready={ready ? "true" : "false"}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <canvas
    bind:this={canvas}
    data-testid="map-canvas"
    aria-label="Island map. Drag to pan, scroll or use plus and minus to zoom, arrow keys to move."
    tabindex="0"
    {onpointerdown} {onpointermove} {onpointerup} onpointercancel={onpointerup} onpointerleave={() => onhover(null)}
    {onwheel} {onkeydown}
  ></canvas>
</div>

<style>
  .host { position: relative; flex: 1; min-height: 320px; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: #80d7c3; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; display: block; }
  canvas:active { cursor: grabbing; }
</style>
