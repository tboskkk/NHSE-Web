<script lang="ts">
  import { buildingTypeName, isKnownBuildingType, KNOWN_BUILDING_TYPES, skipsGroundRule, type BuildingEditOp, type MapData } from "@nhse/core";
  import { api, edit, showToast } from "../lib/state.svelte";
  import { addOp, deleteOp, fieldOp, freeSlots, type Target } from "./buildingTool";

  let { map, version, acreW, selected = $bindable(), addType = $bindable() }: {
    map: MapData;
    version: number;
    acreW: number;
    selected: Target | null;
    /** Building type waiting to be placed with a click on the map, or null. */
    addType: number | null;
  } = $props();

  const types = [...KNOWN_BUILDING_TYPES].sort((a, b) => a - b);
  let newType = $state(21);
  const slots = $derived((void version, map.buildings.map((b, slot) => ({ b, slot })).filter((x) => x.b.type !== 0)));
  const b = $derived((void version, selected?.kind === "building" ? map.buildings[selected.slot] ?? null : null));
  const free = $derived((void version, freeSlots(map)));

  /** Plans first so a refusal reads as a message and the input reverts; only valid ops reach edit(). */
  async function run(op: BuildingEditOp, el?: HTMLInputElement | HTMLSelectElement, original?: string) {
    const r = await api.buildingPlan(op);
    if (!r.ok) {
      showToast(r.reason);
      if (el && original !== undefined) el.value = original;
      return false;
    }
    await edit(op);
    return true;
  }

  function field(key: "type" | "angle" | "subType" | "typeArg" | "bit" | "uniqueId" | "x" | "y", original: number) {
    return (e: Event) => {
      const el = e.currentTarget as HTMLInputElement | HTMLSelectElement;
      if (selected?.kind !== "building") return;
      void run(fieldOp(map, selected.slot, { [key]: Number(el.value) }), el, String(original));
    };
  }

  function movePlaza(axis: "x" | "z", original: number) {
    return (e: Event) => {
      const el = e.currentTarget as HTMLInputElement;
      void run({ op: "buildingEdit", label: "Move plaza", changes: [], plaza: { ...map.plaza, [axis]: Number(el.value) } }, el, String(original));
    };
  }

  async function del() {
    if (selected?.kind !== "building") return;
    if (await run(deleteOp(map, selected.slot))) selected = null;
  }

  function startAdd() {
    if (addOp(map, acreW, newType, { x: 0, y: 0 }) === null) {
      showToast("All 46 building slots are in use.");
      return;
    }
    addType = newType;
    selected = null;
  }

  function pick(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    selected = v === "plaza" ? { kind: "plaza" } : v === "" ? null : { kind: "building", slot: Number(v) };
  }
</script>

<section class="panel" aria-label="Buildings">
  <h2>Buildings</h2>
  <label>Selected
    <select data-testid="bld-select" value={selected?.kind === "plaza" ? "plaza" : selected ? String(selected.slot) : ""} onchange={pick}>
      <option value="">None</option>
      {#each slots as s (s.slot)}<option value={String(s.slot)}>#{s.slot} {buildingTypeName(s.b.type)}</option>{/each}
      <option value="plaza">Plaza</option>
    </select>
  </label>

  {#if b && selected?.kind === "building"}
    {#key `${selected.slot}-${version}`}
      <label>Type
        <select data-testid="bld-type" value={String(b.type)} onchange={field("type", b.type)}>
          {#if !isKnownBuildingType(b.type)}<option value={String(b.type)}>#{b.type} (unknown)</option>{/if}
          {#each types as t (t)}<option value={String(t)}>{buildingTypeName(t)}</option>{/each}
        </select>
      </label>
      <label>X <input data-testid="bld-x" type="number" value={b.x} onchange={field("x", b.x)} /></label>
      <label>Y <input data-testid="bld-y" type="number" value={b.y} onchange={field("y", b.y)} /></label>
      <label>Angle (0-3) <input data-testid="bld-angle" type="number" min="0" max="3" value={b.angle} onchange={field("angle", b.angle)} /></label>
      <label>Unique ID <input data-testid="bld-uid" type="number" min="0" value={b.uniqueId} onchange={field("uniqueId", b.uniqueId)} /></label>
      <label>Subtype <span class="badge">unverified</span> <input type="number" min="0" value={b.subType} onchange={field("subType", b.subType)} /></label>
      <label>Type arg <span class="badge">unverified</span> <input type="number" min="0" max="255" value={b.typeArg} onchange={field("typeArg", b.typeArg)} /></label>
      <label>Bit <span class="badge">unverified</span> <input type="number" min="-128" max="127" value={b.bit} onchange={field("bit", b.bit)} /></label>
      {#if skipsGroundRule(b.type)}<p class="muted">Ground rule unverified for this type.</p>{/if}
      <button data-testid="bld-delete" onclick={del}>Delete building</button>
    {/key}
  {:else if selected?.kind === "plaza"}
    {#key version}
      <label>Plaza X <input data-testid="plaza-x" type="number" value={map.plaza.x} onchange={movePlaza("x", map.plaza.x)} /></label>
      <label>Plaza Z <input data-testid="plaza-z" type="number" value={map.plaza.z} onchange={movePlaza("z", map.plaza.z)} /></label>
    {/key}
  {:else}
    <p class="muted">Click a building or the plaza on the map, or pick one above. Drag to move.</p>
  {/if}

  <hr />
  <label>New building
    <select data-testid="bld-add-type" bind:value={newType}>
      {#each types as t (t)}<option value={t}>{buildingTypeName(t)}</option>{/each}
    </select>
  </label>
  <button data-testid="bld-add" onclick={startAdd}>Add building…</button>
  {#if addType !== null}
    <p class="muted">Click the map to place {buildingTypeName(addType)}. <button onclick={() => (addType = null)}>Cancel</button></p>
  {/if}
  {#if free === 0}<p class="muted">All 46 building slots are in use.</p>{/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 6px; }
  h2 { margin: 0; font-size: 1rem; }
  label { display: flex; flex-direction: column; gap: 2px; font-size: 0.85rem; }
  input, select { font: inherit; }
  .badge { font-size: 0.7rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
  hr { border: 0; border-top: 1px solid var(--border); width: 100%; }
</style>
