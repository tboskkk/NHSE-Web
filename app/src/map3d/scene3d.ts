import { type MapData } from "@nhse/core";
import type { Ghost, LayerId } from "../map/scene";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SpriteSource } from "../map/spriteSource";
import { MODEL_SCALE, SEA_RGB, WATER_Y } from "./constants";
import { controlsConfig, type Action } from "./controlsMode";
import { keyDelta } from "./cameraKeys";
import { groupItems, type Instance } from "./itemGroups";
import type { LoadedModels } from "./modelPack";
import { structureBoxes } from "./structureBoxes";
import { ghostCorners, itemTileOrigin, type Tile, worldToItemTile, worldToTerrainTile } from "./pick";
import { buildTerrainMesh, buildTileField, heightAt, type TileField } from "./terrainMesh";

export interface Scene3D {
  refreshTerrain(): void;
  refreshStructures(): void;
  refreshItems(): void;
  setSprites(s: SpriteSource): void;
  /** Imported natural-item models (null clears); items without a ready model keep their billboards. */
  setModels(m: LoadedModels | null): void;
  setGrid(on: boolean): void;
  /** Applies a camera key (WASD/arrows pan, R/F tilt); false when the key is not a camera key. */
  handleKey(key: string): boolean;
  resize(w: number, h: number): void;
  dispose(): void;
  /**
   * Tile(s) under a canvas point: upright billboards first (when `billboards`), then terrain, then the water plane.
   * Null when the ray hits nothing; `item`/`terrain` are null when the hit lies outside that grid.
   */
  pick(clientX: number, clientY: number, opts: { billboards: boolean }): { item: Tile | null; terrain: Tile | null } | null;
  /** Translucent rectangle draped on the ground over an item-tile footprint (null hides it). */
  setGhost(g: Ghost | null): void;
  /** Edit mode frees the left button and one finger for painting; Space turns the left button into a pan. */
  setEditing(editing: boolean, spaceHeld: boolean): void;
  setLayers(l: Record<LayerId, boolean>): void;
  /** Canvas-relative CSS px of an item tile's centre at ground height; null when behind the camera. */
  projectTile(x: number, y: number): { x: number; y: number } | null;
}

export type Scene3DOptions = { map: MapData; acreTiles: Uint8Array; sprites: SpriteSource; onError(message: string): void };

const WORLD = { w: 288, h: 256 }; // world units (item tiles): 9 x 8 acres
const MIN_POLAR = 0.15, MAX_POLAR = 1.45;
const toLinear = (c: number) => Math.pow(c, 2.2); // vertex colours are authored in sRGB

const noop: Scene3D = { refreshTerrain() {}, refreshStructures() {}, refreshItems() {}, setSprites() {}, setModels() {}, setGrid() {}, handleKey: () => false, resize() {}, dispose() {}, pick: () => null, setGhost() {}, setEditing() {}, setLayers() {}, projectTile: () => null };

/** The three.js scene for the 3D map. Renders on demand; returns an inert scene and calls `onError` if WebGL is unavailable. */
export function createScene3D(canvas: HTMLCanvasElement, opts: Scene3DOptions): Scene3D {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    opts.onError(`WebGL is not available (${e instanceof Error ? e.message : String(e)})`);
    return noop;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    opts.onError("the WebGL context was lost");
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SEA_RGB); // matches the water plane over sea tiles, so the horizon is seamless
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a66, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(100, 200, 60);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  const centre = new THREE.Vector3(WORLD.w / 2, 0, WORLD.h / 2);
  camera.position.set(centre.x, 170, centre.z + 200);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(centre);
  controls.minDistance = 20;
  controls.maxDistance = 400;
  controls.minPolarAngle = MIN_POLAR;
  controls.maxPolarAngle = MAX_POLAR;
  controls.update();

  let sprites = opts.sprites;
  let field: TileField;
  let raf = 0;
  let disposed = false;
  const schedule = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(render);
  };
  const render = () => {
    raf = 0;
    if (disposed) return;
    renderer.render(scene, camera);
  };

  // ---- terrain + water ----
  const terrain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  scene.add(terrain);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), // far larger than the island so no edge shows at the horizon
    new THREE.MeshBasicMaterial({ color: 0x3aa6c8, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  water.position.set(WORLD.w / 2, WATER_Y + 0.2, WORLD.h / 2);
  scene.add(water);

  const refreshTerrain = () => {
    field = buildTileField(opts.map, opts.acreTiles);
    const m = buildTerrainMesh(field);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(m.colors.map(toLinear), 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    g.computeVertexNormals();
    terrain.geometry.dispose();
    terrain.geometry = g;
    refreshStructures();
    refreshItems();
  };

  // ---- structures ----
  const structures = new THREE.Group();
  scene.add(structures);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function refreshStructures() {
    for (const c of structures.children as THREE.Mesh[]) (c.material as THREE.Material).dispose();
    structures.clear();
    for (const b of structureBoxes(opts.map, field)) {
      const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: b.color }));
      mesh.scale.set(b.w, b.h, b.d);
      mesh.position.set(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2);
      structures.add(mesh);
    }
    schedule();
  }

  // ---- items: one InstancedMesh per sprite url ----
  const itemsGroup = new THREE.Group();
  scene.add(itemsGroup);
  const textures = new Map<string, THREE.Texture | null>();
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const upright: { mesh: THREE.InstancedMesh; list: Instance[] }[] = [];
  let layerVis: Record<LayerId, boolean> = { terrain: true, items0: true, items1: true, buildings: true, grid: false };
  const dummy = new THREE.Object3D();
  const placeUpright = () => {
    const az = controls.getAzimuthalAngle();
    for (const { mesh, list } of upright) {
      list.forEach((i, n) => {
        dummy.position.set(i.x, i.y + i.h / 2, i.z);
        dummy.rotation.set(0, az, 0);
        dummy.scale.set(i.w, i.h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  const loadTexture = (url: string, done: (t: THREE.Texture | null) => void) => {
    if (textures.has(url)) return done(textures.get(url)!);
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.magFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        textures.set(url, t);
        done(t);
      },
      undefined,
      () => {
        textures.set(url, null);
        done(null);
      },
    );
  };
  // imported natural-item models: ready assets only; items of a model that is still loading or failed keep their billboards
  let modelAssets = new Map<string, { geometry: THREE.BufferGeometry; texture: THREE.Texture }>();
  let modelItems = new Map<number, string>();
  let modelToken = 0;
  const disposeModels = () => {
    for (const a of modelAssets.values()) { a.geometry.dispose(); a.texture.dispose(); }
    modelAssets = new Map();
    modelItems = new Map();
  };
  const loadModelTexture = (png: Uint8Array) =>
    new Promise<THREE.Texture>((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" }));
      new THREE.TextureLoader().load(url, (t) => { URL.revokeObjectURL(url); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; resolve(t); }, undefined, () => { URL.revokeObjectURL(url); reject(new Error("texture failed")); });
    });
  function setModels(pack: LoadedModels | null) {
    const token = ++modelToken;
    if (!pack) { disposeModels(); refreshItems(); return; }
    Promise.all(
      [...pack.models].map(async ([key, m]) => {
        try {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(m.geometry.positions, 3));
          g.setAttribute("normal", new THREE.BufferAttribute(m.geometry.normals, 3));
          g.setAttribute("uv", new THREE.BufferAttribute(m.geometry.uvs, 2));
          g.setIndex(new THREE.BufferAttribute(m.geometry.indices, 1));
          return [key, { geometry: g, texture: await loadModelTexture(m.texture) }] as const;
        } catch {
          return null; // a model whose texture fails to load is left out: its items keep their billboards
        }
      }),
    ).then((list) => {
      if (token !== modelToken || disposed) { for (const e of list) if (e) { e[1].geometry.dispose(); e[1].texture.dispose(); } return; }
      disposeModels();
      modelAssets = new Map(list.filter((e): e is NonNullable<typeof e> => e !== null));
      modelItems = new Map([...pack.items].filter(([, key]) => modelAssets.has(key)));
      refreshItems();
    });
  }
  let itemsToken = 0;
  function refreshItems() {
    const token = ++itemsToken;
    for (const c of itemsGroup.children as THREE.InstancedMesh[]) {
      (c.material as THREE.Material).dispose();
      c.dispose();
    }
    itemsGroup.clear();
    upright.length = 0;
    const groups = groupItems(opts.map, field, sprites, (id) => modelItems.get(id) ?? null);
    const add = (url: string, all: Instance[], flat: boolean) =>
      loadTexture(url, (tex) => {
        if (token !== itemsToken || !tex || disposed) return; // stale refresh, or a sprite that failed to load
        for (const layer of [0, 1] as const) addLayer(tex, all.filter((i) => i.layer === layer), flat, layer);
        schedule();
      });
    const addLayer = (tex: THREE.Texture, list: Instance[], flat: boolean, layer: 0 | 1) => {
      if (list.length === 0) return;
      {
        const mesh = new THREE.InstancedMesh(planeGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide }), list.length);
        mesh.userData.layer = layer;
        mesh.visible = layer === 0 ? layerVis.items0 : layerVis.items1;
        if (flat) {
          list.forEach((i, n) => {
            dummy.position.set(i.x, i.y, i.z);
            dummy.rotation.set(-Math.PI / 2, 0, 0);
            dummy.scale.set(i.w, i.h, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(n, dummy.matrix);
          });
        } else {
          upright.push({ mesh, list });
          placeUpright();
        }
        itemsGroup.add(mesh);
      }
    };
    for (const [key, all] of groups.models) {
      const asset = modelAssets.get(key);
      if (!asset) continue;
      for (const layer of [0, 1] as const) {
        const list = all.filter((i) => i.layer === layer);
        if (list.length === 0) continue;
        const mesh = new THREE.InstancedMesh(asset.geometry, new THREE.MeshLambertMaterial({ map: asset.texture, alphaTest: 0.5, side: THREE.DoubleSide }), list.length);
        mesh.userData.layer = layer;
        mesh.visible = layer === 0 ? layerVis.items0 : layerVis.items1;
        list.forEach((i, n) => {
          dummy.position.set(i.x, i.y, i.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(MODEL_SCALE);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
        });
        itemsGroup.add(mesh);
      }
    }
    for (const [url, list] of groups.flat) add(url, list, true);
    for (const [url, list] of groups.upright) add(url, list, false);
    schedule();
  }

  // ---- acre grid ----
  const gridPts: number[] = [];
  for (let x = 0; x <= WORLD.w; x += 32) gridPts.push(x, 0.1, 0, x, 0.1, WORLD.h);
  for (let z = 0; z <= WORLD.h; z += 32) gridPts.push(0, 0.1, z, WORLD.w, 0.1, z);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
  grid.visible = false;
  scene.add(grid);
  let gridKey = false;
  const applyGrid = () => (grid.visible = layerVis.grid || gridKey);


  // ---- ghost (translucent footprint draped on the ground) ----
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  ghostGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const ghostFill = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: 0x30c050, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthTest: false }));
  const ghostLine = new THREE.LineLoop(ghostGeo, new THREE.LineBasicMaterial({ color: 0x30c050, depthTest: false }));
  for (const o of [ghostFill, ghostLine]) {
    o.renderOrder = 10;
    o.frustumCulled = false;
    o.visible = false;
    scene.add(o);
  }
  const itemAcres = () => opts.map.items[0].width / 32;

  // ---- picking ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const MOUSE_OF: Record<string, THREE.MOUSE> = { rotate: THREE.MOUSE.ROTATE, pan: THREE.MOUSE.PAN, dolly: THREE.MOUSE.DOLLY };
  const mouse = (a: Action) => (a ? MOUSE_OF[a]! : null);
  const touchOf = (a: Action) => (a === "rotate" ? THREE.TOUCH.ROTATE : a === "pan" ? THREE.TOUCH.PAN : null);

  controls.addEventListener("change", () => {
    placeUpright();
    schedule();
  });
  refreshTerrain();
  render();

  return {
    refreshTerrain,
    refreshStructures,
    refreshItems,
    setSprites(s) {
      sprites = s;
      refreshItems();
    },
    setModels,
    setGrid(on) {
      gridKey = on;
      applyGrid();
      schedule();
    },
    handleKey(key) {
      const d = keyDelta(key, -controls.getAzimuthalAngle());
      if (!d) return false;
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.phi = Math.min(MAX_POLAR, Math.max(MIN_POLAR, sph.phi + d.dPolar));
      controls.target.add(new THREE.Vector3(d.dx, 0, d.dz));
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      schedule();
      return true;
    },
    pick(clientX, clientY, { billboards }) {
      const r = canvas.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const ground = ray.intersectObject(terrain, false)[0] ?? ray.intersectObject(water, false)[0];
      let bill: { dist: number; item: Tile; x: number; z: number } | null = null;
      if (billboards) {
        const hit = ray.intersectObjects(upright.map((u) => u.mesh).filter((m) => m.visible), false)[0];
        if (hit && hit.instanceId !== undefined) {
          const inst = upright.find((u) => u.mesh === hit.object)?.list[hit.instanceId];
          if (inst) bill = { dist: hit.distance, item: inst.tile, x: inst.x, z: inst.z };
        }
      }
      if (bill && (!ground || bill.dist <= ground.distance)) return { item: bill.item, terrain: worldToTerrainTile(bill.x, bill.z) };
      if (!ground) return null;
      return { item: worldToItemTile(ground.point.x, ground.point.z, itemAcres()), terrain: worldToTerrainTile(ground.point.x, ground.point.z) };
    },
    setGhost(g) {
      ghostFill.visible = ghostLine.visible = g !== null;
      if (g) {
        (ghostGeo.getAttribute("position") as THREE.BufferAttribute).set(ghostCorners(g, itemAcres(), field));
        ghostGeo.getAttribute("position").needsUpdate = true;
        const c = g.ok ? 0x30c050 : 0xd03030;
        (ghostFill.material as THREE.MeshBasicMaterial).color.setHex(c);
        (ghostLine.material as THREE.LineBasicMaterial).color.setHex(c);
      }
      schedule();
    },
    setEditing(editing, spaceHeld) {
      const c = controlsConfig(editing, spaceHeld);
      controls.mouseButtons = { LEFT: mouse(c.left), MIDDLE: mouse(c.middle), RIGHT: mouse(c.right) };
      controls.touches = { ONE: touchOf(c.oneFinger), TWO: c.twoFingers === "dolly-rotate" ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN };
    },
    setLayers(l) {
      layerVis = l;
      terrain.visible = water.visible = l.terrain;
      structures.visible = l.buildings;
      for (const m of itemsGroup.children) m.visible = m.userData.layer === 0 ? l.items0 : l.items1;
      applyGrid();
      schedule();
    },
    projectTile(x, y) {
      const o = itemTileOrigin({ x, y }, itemAcres());
      const wx = o.x + 0.5, wz = o.z + 0.5;
      const v = new THREE.Vector3(wx, heightAt(field, wx, wz), wz).project(camera);
      if (v.z < -1 || v.z > 1) return null;
      const r = canvas.getBoundingClientRect();
      return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      schedule();
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      controls.dispose();
      terrain.geometry.dispose();
      (terrain.material as THREE.Material).dispose();
      ghostGeo.dispose();
      (ghostFill.material as THREE.Material).dispose();
      (ghostLine.material as THREE.Material).dispose();
      for (const c of [...structures.children, ...itemsGroup.children] as THREE.Mesh[]) (c.material as THREE.Material).dispose();
      for (const t of textures.values()) t?.dispose();
      disposeModels();
      renderer.dispose();
    },
  };
}
