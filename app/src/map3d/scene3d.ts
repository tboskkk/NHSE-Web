import { type MapData } from "@nhse/core";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SpriteSource } from "../map/spriteSource";
import { WATER_Y } from "./constants";
import { keyDelta } from "./cameraKeys";
import { groupItems, type Instance } from "./itemGroups";
import { structureBoxes } from "./structureBoxes";
import { buildTerrainMesh, buildTileField, type TileField } from "./terrainMesh";

export interface Scene3D {
  refreshTerrain(): void;
  refreshStructures(): void;
  refreshItems(): void;
  setSprites(s: SpriteSource): void;
  setGrid(on: boolean): void;
  /** Applies a camera key (WASD/arrows pan, R/F tilt); false when the key is not a camera key. */
  handleKey(key: string): boolean;
  resize(w: number, h: number): void;
  dispose(): void;
}

export type Scene3DOptions = { map: MapData; acreTiles: Uint8Array; sprites: SpriteSource; onError(message: string): void };

const WORLD = { w: 288, h: 256 }; // world units (item tiles): 9 x 8 acres
const MIN_POLAR = 0.15, MAX_POLAR = 1.45;
const toLinear = (c: number) => Math.pow(c, 2.2); // vertex colours are authored in sRGB

const noop: Scene3D = { refreshTerrain() {}, refreshStructures() {}, refreshItems() {}, setSprites() {}, setGrid() {}, handleKey: () => false, resize() {}, dispose() {} };

/** The three.js scene for the read-only 3D map. Renders on demand; returns an inert scene and calls `onError` if WebGL is unavailable. */
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
  scene.background = new THREE.Color(0x80d7c3);
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
    new THREE.PlaneGeometry(WORLD.w, WORLD.h).rotateX(-Math.PI / 2),
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
  let itemsToken = 0;
  function refreshItems() {
    const token = ++itemsToken;
    for (const c of itemsGroup.children as THREE.InstancedMesh[]) {
      (c.material as THREE.Material).dispose();
      c.dispose();
    }
    itemsGroup.clear();
    upright.length = 0;
    const groups = groupItems(opts.map, field, sprites);
    const add = (url: string, list: Instance[], flat: boolean) =>
      loadTexture(url, (tex) => {
        if (token !== itemsToken || !tex || disposed) return; // stale refresh, or a sprite that failed to load
        const mesh = new THREE.InstancedMesh(planeGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide }), list.length);
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
        schedule();
      });
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
    setGrid(on) {
      grid.visible = on;
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
      for (const c of [...structures.children, ...itemsGroup.children] as THREE.Mesh[]) (c.material as THREE.Material).dispose();
      for (const t of textures.values()) t?.dispose();
      renderer.dispose();
    },
  };
}
