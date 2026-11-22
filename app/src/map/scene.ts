import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { MapData } from "@nhse/core";
import { type Camera, clampCamera } from "./camera";
import { BUILDING_TILES, makeLayout, PX_PER_ITEM_TILE, WORLD_PX, type Layout } from "./layout";
import type { SpriteSource } from "./spriteSource";
import { renderTerrainRGBA } from "./terrainImage";
import { OCEAN_RGBA } from "./terrainPalette";
import { tileToWorld, visibleTileRange } from "./tiles";

export type LayerId = "terrain" | "items0" | "items1" | "buildings" | "grid";

export type SceneOptions = { acreTiles: Uint8Array; sprites: SpriteSource; buildingName: (type: number) => string };

export interface MapScene {
  readonly layout: Layout;
  setLayerVisible(layer: LayerId, on: boolean): void;
  setSprites(src: SpriteSource): void;
  setCamera(c: Camera): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

const NONE = 0xfffe;
const EXTENSION = 0xfffd;

const PLAZA_TILES = { w: 24, h: 20 }; // upstream plaza: (6x5) * 2 * imgScale(2)
const TERRAIN_IMAGE_SCALE = 2; // px per terrain tile in the generated texture

export async function createMapScene(canvas: HTMLCanvasElement, map: MapData, opts: SceneOptions): Promise<MapScene> {
  const layout = makeLayout(map.items[0].width / 32);
  const app = new Application();
  await app.init({
    canvas,
    width: canvas.clientWidth || 800,
    height: canvas.clientHeight || 600,
    background: (OCEAN_RGBA[0] << 16) | (OCEAN_RGBA[1] << 8) | OCEAN_RGBA[2],
    preference: "webgl",
    antialias: false,
    autoStart: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let view = { w: app.screen.width, h: app.screen.height };
  let sprites = opts.sprites;
  let destroyed = false;
  let raf = 0;

  const world = new Container();
  app.stage.addChild(world);
  const layers: Record<LayerId, Container> = {
    terrain: new Container(), items0: new Container(), items1: new Container(), buildings: new Container(), grid: new Container(),
  };
  for (const id of ["terrain", "items0", "items1", "buildings", "grid"] as const) world.addChild(layers[id]);

  // terrain: one texture for the whole 9x8-acre world, nearest-neighbour
  const img = renderTerrainRGBA(map.terrain, map.acres, opts.acreTiles, TERRAIN_IMAGE_SCALE);
  const tcanvas = document.createElement("canvas");
  tcanvas.width = img.width;
  tcanvas.height = img.height;
  tcanvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.pixels), img.width, img.height), 0, 0);
  const terrainTex = Texture.from(tcanvas);
  terrainTex.source.scaleMode = "nearest";
  const terrainSprite = new Sprite(terrainTex);
  terrainSprite.scale.set(WORLD_PX.w / img.width);
  layers.terrain.addChild(terrainSprite);

  // grid: acre lines
  const grid = new Graphics();
  const acrePx = 32 * PX_PER_ITEM_TILE;
  for (let i = 0; i <= 9; i++) grid.moveTo(i * acrePx, 0).lineTo(i * acrePx, WORLD_PX.h);
  for (let j = 0; j <= 8; j++) grid.moveTo(0, j * acrePx).lineTo(WORLD_PX.w, j * acrePx);
  grid.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
  layers.grid.addChild(grid);

  // buildings + plaza
  const plaza = layout.toWorldPx(map.plaza.x, map.plaza.z);
  layers.buildings.addChild(
    new Graphics().rect(plaza.x, plaza.y, PLAZA_TILES.w * PX_PER_ITEM_TILE, PLAZA_TILES.h * PX_PER_ITEM_TILE).fill({ color: 0xbc8f8f, alpha: 0.5 }),
  );
  for (const b of map.buildings) {
    if (b.type === 0) continue;
    const p = layout.toWorldPx(b.x, b.y);
    const size = BUILDING_TILES * PX_PER_ITEM_TILE;
    layers.buildings.addChild(new Graphics().rect(p.x, p.y, size, size).fill({ color: 0xffd400, alpha: 0.6 }).stroke({ width: 2, color: 0x202020 }));
    const label = new Text({ text: opts.buildingName(b.type), style: { fontSize: 18, fill: 0x101010, fontFamily: "sans-serif" } });
    label.position.set(p.x + 4, p.y + 4);
    layers.buildings.addChild(label);
  }

  // item sprites: pooled, only for tiles in view; textures load lazily and trigger a refresh when ready
  const textures = new Map<string, Texture | "loading" | "failed">();
  const pools: Sprite[][] = [[], []];
  const getTexture = (url: string): Texture | null => {
    const t = textures.get(url);
    if (t instanceof Texture) return t;
    if (t === undefined) {
      textures.set(url, "loading");
      fetch(url)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => createImageBitmap(b))
        .then((bmp) => {
          if (destroyed) return;
          const tex = Texture.from(bmp);
          tex.source.scaleMode = "nearest";
          textures.set(url, tex);
          refresh();
        })
        .catch(() => textures.set(url, "failed"));
    }
    return null;
  };

  const refreshItems = () => {
    const g = layout.items;
    const r = visibleTileRange(camera, view, g);
    for (const n of [0, 1] as const) {
      const layer = map.items[n];
      const pool = pools[n]!;
      let used = 0;
      for (let x = r.x0; x <= r.x1; x++) {
        for (let y = r.y0; y <= r.y1; y++) {
          const raw = layer.raw[g.height * x + y]!;
          const id = Number(raw & 0xffffn);
          if (id === NONE || id === EXTENSION) continue;
          const ref = sprites.resolve(id, Number((raw >> 32n) & 0xffffn));
          const tex = getTexture(ref.url);
          if (!tex) continue;
          let s = pool[used];
          if (!s) pool[used] = s = layers[n === 0 ? "items0" : "items1"].addChild(new Sprite());
          const p = tileToWorld(g, x, y);
          s.texture = tex;
          s.position.set(p.x, p.y);
          s.width = s.height = g.tileSize;
          s.visible = true;
          used++;
        }
      }
      for (let i = used; i < pool.length; i++) pool[i]!.visible = false;
    }
  };

  const render = () => {
    raf = 0;
    if (destroyed) return;
    world.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
    world.scale.set(camera.zoom);
    app.render();
  };
  const schedule = () => {
    if (!raf && !destroyed) raf = requestAnimationFrame(render);
  };
  const refresh = () => {
    refreshItems();
    schedule();
  };

  return {
    layout,
    setLayerVisible(layer, on) {
      layers[layer].visible = on;
      schedule();
    },
    setSprites(src) {
      sprites = src;
      refresh();
    },
    setCamera(c) {
      camera = clampCamera(c, WORLD_PX, view);
      refresh();
    },
    resize(w, h) {
      if (!(w > 0 && h > 0)) return;
      app.renderer.resize(w, h);
      view = { w, h };
      refresh();
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      for (const t of textures.values()) if (t instanceof Texture) t.destroy(true);
      app.destroy({ removeView: false }, { children: true, texture: true, textureSource: true });
    },
  };
}
