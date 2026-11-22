# Map Editor P2b: Buildings and Plaza Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move, add, delete and retype the 46 building slots and move the plaza in the browser, with strict refusals, byte-identical to upstream NHSE, undoable.

**Architecture:** One new `buildingEdit` `EditOp` (whole-slot replacements + optional plaza) planned by a pure `planBuildingEdit` that validates the final state of every *changed* entry. It rides the existing `EditSession` byte-patch undo, a worker `buildingPlan` for ghost validity, a `structures` snapshot returned by edit/undo/redo so the viewer patches buildings in place, and a "Buildings" tool that reuses the Map page's `paint` gesture sink.

**Tech Stack:** TypeScript (bun test), Svelte 5 runes, PixiJS 8, Playwright, C# oracle in `reference/` (upstream NHSE.Core, .NET 10).

**Spec:** `docs/superpowers/specs/2026-11-22-map-editor-buildings-design.md` (also read `2026-11-22-map-editor-items-design.md` and the "Map editor facts" in `docs/superpowers/HANDOFF.md`).

## Global Constraints

- Strict edits only: a rule violation throws and changes **no bytes**; refusal reasons are user-facing strings.
- Every accepted edit is byte-identical to upstream through the oracle (`reference/`), golden-tested.
- Items under a new footprint: **refuse** (never auto-clear). Ground: ordinary buildings and the plaza need `groundAt === "land"` on every footprint tile; building types 26 (bridge) and 27 (incline) skip the ground check ("unverified" in UI).
- Field rules: type is 0 or in 1-29 or 42; angle 0-3; uniqueId unique among non-empty slots; type value unique among non-empty slots except 26 and 27; subType/typeArg/bit free ("unverified" badge). Value ranges: x,y,uniqueId,subType u16; typeArg u8; bit i8; plaza x,z u32; all integers.
- A rule only applies to entries the op changes (slot bytes or plaza differ from current); a save that already breaks a rule must not block unrelated edits.
- Clearing (type 0) zeroes all 20 bytes; retype/move preserve the 4 unused bytes at 0x10.
- Core is pure TS; `$state.raw` for anything holding an EditOp; UI edits only via `edit(op)` from `app/src/lib/state.svelte.ts`.
- Never commit `example-save-file/` or Nintendo sprites. No attribution lines in commits. Do not push.
- Every deviation from this plan is recorded as a `Ruling:` line in the commit body and reported at the end.
- Env for every command: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH`; golden/e2e need `NHSE_TEST_SAVE=$PWD/example-save-file`. Baseline: 186 unit + 4 e2e pass.

## Review Focus

- Swapping two buildings' positions (or moving A into B's old spot) in one op is accepted: validation uses the final state. Test in Task 2.
- A save that already has an overlapping/duplicate pair does not block moving a third building. Test in Task 2.
- The same slot twice in `changes`, or a slot outside 0-45, is refused with no bytes changed. Test in Task 2.
- A 4x4 footprint partly outside the item area, or a plaza near the map edge, is refused ("outside the item area"). Test in Task 2.
- Undo/redo of a building edit restores the exact bytes of slots and plaza, including the unused bytes. Test in Task 3.
- All 46 slots full: "Add building" shows a clear message instead of doing nothing. Test in Task 7.

## File Structure

- Create `packages/core/src/map/buildingTypes.ts`: known type set, `BRIDGE`/`INCLINE`, `SINGLE_TYPE` rule helper.
- Create `packages/core/src/map/applyBuildingEdit.ts`: `BuildingEditOp`, `planBuildingEdit`, `writeBuildingEdit`.
- Modify `packages/core/src/map/placement.ts` (export `groundReason`), `packages/core/src/edit/ops.ts`, `packages/core/src/index.ts`, `tests/unit/mapFixture.ts` (46 empty building slots).
- Create `reference/Commands/BuildingEdit.cs`; modify `reference/Commands/Edit.cs`.
- Modify `app/src/worker/{handlers,protocol}.ts`; modify `app/src/map/{mapStore,scene}.ts`, `app/src/lib/state.svelte.ts`.
- Create `app/src/map/buildingTool.ts` (pure drag/hit-test/op builders), `app/src/map/BuildingPanel.svelte`; modify `MapToolbar.svelte`, `MapSection.svelte`.
- Tests: `tests/unit/{buildingEdit,buildingTool}.test.ts`, `tests/golden/{buildingRules,buildingEdit}.test.ts`, `tests/e2e/buildingEdit.spec.ts`; extend `tests/unit/{mapStore,handlers}.test.ts`.

---

### Task 1: Confirm stored units and rule assumptions against the example save

**Files:**
- Create: `tests/golden/buildingRules.test.ts`

**Interfaces:**
- Consumes: `readMap`, `groundAt`, `itemToWorld`, `BUILDING_ITEM_TILES`, `PLAZA_ITEM_TILES`, `isNone`, `HorizonSave.load`, `goldenTest/readDir/SAVE/REPO` (golden helpers, as in `tests/golden/placementConsistency.test.ts`).
- Produces: a recorded answer (as `Ruling:` lines and an in-file allowlist) to: are stored building x/y world item-tile units (spec reading) or relative (`rel*2+32` upstream)? Do real buildings satisfy the rules (inside item area, land under footprint except bridge/incline, no item under them, no overlaps, unique ids, unique non-bridge/incline types)?

- [ ] **Step 1: Write the golden test** `goldenTest("example save buildings and plaza satisfy the P2b rules", ...)`. For each slot with `type !== 0` and for the plaza, compute violations of each rule using the spec's units (world coords; item coord = world − `itemToWorld(acreW,0,0)`). Collect `violations: string[]` (`"slot 3 type 21: overlaps 2 items"`). First run prints them (`console.log`) with `expect(violations).toEqual(KNOWN)` where `KNOWN` starts as `[]`.
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bun test tests/golden/buildingRules.test.ts`. Expected: FAIL listing every violation (or pass with none).
- [ ] **Step 3: Interpret.** If most buildings land outside the item area or on water, the unit reading is wrong: add `Ruling:` and stop to report to the user before continuing (spec changes needed). Otherwise pin `KNOWN` to the observed exceptions, each with a one-line reason comment (as `placementConsistency.test.ts` does); if a *rule* is wrong for real data (for example a bridge type other than 26/27 spans water, or two buildings share a type), adjust the rule in the Global Constraints list in this plan file and record `Ruling:`.
- [ ] **Step 4: Run again, expect PASS. Commit** `git add tests/golden/buildingRules.test.ts docs/superpowers/plans/... && git commit -m "Map: confirm building units and rules against real save"` (body: the Rulings).

---

### Task 2: `planBuildingEdit` rules (core, pure)

**Files:**
- Create: `packages/core/src/map/buildingTypes.ts`, `packages/core/src/map/applyBuildingEdit.ts`
- Modify: `packages/core/src/map/placement.ts` (export `groundReason(g: Exclude<Ground,"land">): string`, reusing `REASON`), `packages/core/src/index.ts` (export both new modules), `tests/unit/mapFixture.ts` (`emptyMap().buildings` = 46 entries of all-zero `BuildingInfo`)
- Test: `tests/unit/buildingEdit.test.ts`

**Interfaces:**
- Consumes: `BuildingInfo`, `MapData`, `PlaceCtx`, `groundAt`, `itemToWorld`, `BUILDING_ITEM_TILES`, `PLAZA_ITEM_TILES`, `isNone`, `buildingTypeName`.
- Produces:
  - `export const BRIDGE = 26, INCLINE = 27; export const isKnownBuildingType(t: number): boolean;`
  - `export type BuildingEditOp = { op: "buildingEdit"; label: string; changes: { slot: number; building: BuildingInfo }[]; plaza?: { x: number; z: number } };`
  - `export type BuildingPlan = { buildings: BuildingInfo[]; plaza: { x: number; z: number } };` (final state, 46 entries)
  - `export function planBuildingEdit(ctx: PlaceCtx, op: BuildingEditOp): BuildingPlan` (throws `RangeError` with the reason; touches nothing)

- [ ] **Step 1: Write failing tests** in `tests/unit/buildingEdit.test.ts` using `ctxOf(emptyMap())` with a helper `bld(type, x, y, over?)`. Pin these exact assertions (reason substrings in `toThrow`):
  - move a type 21 building 4 tiles right on open land → plan has new x, other slots unchanged.
  - add into an empty slot at an occupied spot → throws `"overlaps building in slot 3"`; onto the plaza → `"overlaps the plaza"`.
  - 4x4 at world x `WORLD_ITEM_TILES.w - 2` → `"outside the item area"`; plaza at `x = 280` → same.
  - over an item on layer 2 (place a raw `0x0000000000000123` root in the fixture layer under the footprint, 2 tiles) → `"overlaps 2 items"`; an extension tile counts.
  - water: set terrain `unitModel = 1` (river) under footprint → `"water"` for type 21, **accepted** for type 26 and 27, refused for the plaza.
  - fields: type 30 → `"unknown building type 30"`; angle 4 → `"angle must be 0-3"`; uniqueId equal to another slot → `"uniqueId 7 is already used by slot 2"`; second type 21 → `"type"` + `"already used by slot"`; two type 26 accepted; non-integer x, x = 65536, typeArg 256, bit 128 → `RangeError`.
  - swap: changes `[{slot 2 → A's coords}, {slot 5 → B's coords}]` accepted (final-state validation). Review-Focus: same slot twice → `"slot 2 appears twice"`; slot 46 → `"slot must be 0-45"`.
  - clear (type 0 building with other fields set) → plan slot is all-zero `BuildingInfo`.
  - pre-existing breakage: fixture has slots 1 and 2 overlapping; moving slot 3 elsewhere succeeds; moving slot 1 still overlapping slot 2 throws.
- [ ] **Step 2: Run** `bun test tests/unit/buildingEdit.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `planBuildingEdit`: validate op shape/ranges first, build final slots/plaza, compute the set of changed entries (field-wise difference vs `ctx.map`), run rules 1-6 of the spec only for changed entries against the final state; footprint → item coords by subtracting `itemToWorld(acreW,0,0)`; ground per tile via `groundAt` + `groundReason` (skip for 26/27). Order of checks: ranges → duplicates of slot → fields → bounds → ground → building overlap → plaza overlap → items.
- [ ] **Step 4: Run** → PASS; `bun run typecheck`.
- [ ] **Step 5: Commit** `Map: building edit rules`.

---

### Task 3: `buildingEdit` as an `EditOp` (apply, validate, describe, undo)

**Files:**
- Modify: `packages/core/src/map/applyBuildingEdit.ts` (add `writeBuildingEdit`), `packages/core/src/edit/ops.ts`
- Test: extend `tests/unit/buildingEdit.test.ts`

**Interfaces:**
- Consumes: `planBuildingEdit`, `readMap`, `EditSession`, `Revision.mainOffsets.{mainFieldStructure,outsideField}`.
- Produces:
  - `export function writeBuildingEdit(main: Uint8Array, rev: Revision, before: BuildingPlan, after: BuildingPlan): void` (writes only slots/plaza that differ: 20-byte layout type@0 x@2 y@4 angle u8@6 bit i8@7 subType@8 typeArg@10 uniqueId@12 u16 each LE; preserves bytes 14-15 and 16-19 unless slot cleared → 20 zero bytes; plaza u32 LE at `outsideField + 72*2 + 4` (x) and `+ 8` (z)).
  - `EditOp` union gains `BuildingEditOp`; `validateOp` plans (needs `env.acreTiles`); `applyOp` writes; `describeOp` returns `op.label`.

- [ ] **Step 1: Failing tests** against a synthetic main buffer is awkward; use the example save under `goldenTest` in `tests/unit/buildingEdit.test.ts` (same style as `tests/unit/mapEdit.test.ts`): (a) applying a move changes exactly the 4 bytes of x/y at the slot offset (diff old/new `main.data`, assert changed byte offsets ⊆ those 4); (b) retype preserves bytes 14-19 (compare to before); (c) clear zeroes 20 bytes; (d) plaza move changes only the 8 plaza bytes; (e) `EditSession.apply` then `undo()` restores `main.data` byte-for-byte and `redo()` reapplies; (f) refused op leaves `main.data` unchanged and `session.changes` empty; (g) a `batch` of two buildingEdits is one undo step.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the three `ops.ts` switch arms (mirror the `mapEdit` arm; `hasMapEdit`-style env requirement is handled in Task 5) and `writeBuildingEdit`. **Step 4: Run** → PASS, `bun run typecheck`. **Step 5: Commit** `Map: buildingEdit op`.

---

### Task 4: Oracle command and golden parity

**Files:**
- Create: `reference/Commands/BuildingEdit.cs`; Modify: `reference/Commands/Edit.cs` (add `if (name == "buildingEdit") { BuildingEdit.Apply(sav, op); return; }` next to `mapEdit`)
- Test: `tests/golden/buildingEdit.test.ts`

**Interfaces:**
- Consumes: upstream `MainSave.Buildings` (get/set `IReadOnlyList<Building>`), `Building.CopyFrom/Clear`, `EventPlazaLeftUpX/Z`, JSON from `BuildingEditOp`.
- Produces: `public static void Apply(HorizonSave sav, JsonElement op)`. Mapping: JSON `type`→`BuildingType`, `subType`→`Type`, `typeArg`→`TypeArg`, `uniqueId`→`UniqueID`; type 0 → `Clear()`, else set fields on the existing `Building` object (keeps `Unused`).

- [ ] **Step 1: Failing test** `goldenTest("buildingEdit is byte-identical to upstream")` (pattern of `tests/golden/mapEdit.test.ts`): ops list covering move, retype, clear, add into an empty slot, swap two slots, plaza move, and a `batch`; free spots are found with `planBuildingEdit` probes. Run oracle `edit`, apply the same ops with `applyOp(..., {acreTiles})`, compare every file byte-for-byte; sanity-assert positions after.
- [ ] **Step 2:** `dotnet build reference -c Release` after writing `BuildingEdit.cs`; first run the test before writing the C# to see it FAIL (unknown op in oracle).
- [ ] **Step 3: Implement** `BuildingEdit.cs`. **Step 4:** `NHSE_TEST_SAVE=$PWD/example-save-file bun test tests/golden/buildingEdit.test.ts` → PASS. If any byte differs, fix the TS writer (oracle is truth) and record a `Ruling:`.
- [ ] **Step 5: Add** refusal parity: for each refusal case in Task 2 that the example save can express, assert `applyOp` throws and `main.data` is unchanged. **Commit** `Map: building oracle and golden tests`.

---

### Task 5: Worker API and protocol

**Files:**
- Modify: `app/src/worker/protocol.ts`, `app/src/worker/handlers.ts`
- Test: extend `tests/unit/handlers.test.ts`

**Interfaces:**
- Consumes: `planBuildingEdit`, `BuildingEditOp`, `readMap`, `Change` patches.
- Produces (protocol):
  - `export type Structures = { buildings: BuildingInfo[]; plaza: { x: number; z: number } };`
  - `EditResult` and `HistoryResult` gain `structures: Structures | null` (non-null only when a patch overlaps the 920 building bytes at `mainFieldStructure` or the 12 plaza bytes).
  - `Api.buildingPlan(op: BuildingEditOp): Promise<{ ok: true } | { ok: false; reason: string }>`; never edits; reason is the thrown message.
  - handlers: extend `hasMapEdit` to also be true for `buildingEdit` so `acreTiles` is fetched.

- [ ] **Step 1: Failing tests** (golden, as the existing `edit(mapEdit) reports touched tiles` test): `edit(buildingEdit move)` returns `structures` with the new x/y and `touched` empty; undo returns `structures` with the old position and redo the new; a non-building edit returns `structures: null`; `buildingPlan` returns `{ok:true}` for the valid move and `{ok:false, reason: /overlaps/}` for an overlapping one and does not dirty (`build("changed")` stays empty).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, `bun run typecheck`. **Step 5: Commit** `Map: worker building plan and structures`.

---

### Task 6: Viewer plumbing (store, scene, state)

**Files:**
- Modify: `app/src/map/mapStore.ts`, `app/src/map/scene.ts`, `app/src/map/MapView.svelte`, `app/src/lib/state.svelte.ts`, `app/src/sections/map/MapSection.svelte` (subscribe only)
- Test: extend `tests/unit/mapStore.test.ts`

**Interfaces:**
- Consumes: `Structures` from Task 5.
- Produces: `MapStore.patchStructures(s: Structures): void` (replaces `map.buildings` entries and `map.plaza` in place, bumps `version`, notifies); `MapScene.invalidateBuildings(): void` (clears and redraws the buildings container from `map.buildings`/`map.plaza`, extracting the existing draw code into a function used at creation and here); `state.svelte.ts`: `onStructuresTouched(cb: (s: Structures) => void): () => void` fired from `doEdit`, `undo`, `redo` when `structures` is non-null (next to `emitTouched`).

- [ ] **Step 1: Failing tests** in `tests/unit/mapStore.test.ts`: `patchStructures` updates `map.buildings[2]` and `map.plaza`, bumps `version` once, calls subscribers; wrong-length `buildings` throws before changing anything.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; MapView calls `scene.invalidateBuildings()` inside the existing `version` `$effect`; MapSection subscribes `onStructuresTouched((s) => store?.patchStructures(s))` in the same `$effect` as `onMapTouched`. **Step 4:** `bun test tests/unit/mapStore.test.ts && bun run typecheck && bun run build` → pass. **Step 5: Commit** `Map: patch buildings in place`.

---

### Task 7: Building tool and panel

**Files:**
- Create: `app/src/map/buildingTool.ts`, `app/src/map/BuildingPanel.svelte`
- Modify: `app/src/map/MapToolbar.svelte` (add a "Buildings" button next to the item tools; selecting it hides the layer selector's meaning only visually, no new prop shape: extend `Tool` in `tools.ts` with `"building"`, with `createStroke` unchanged since the building tool does not use it), `app/src/sections/map/MapSection.svelte`
- Test: `tests/unit/buildingTool.test.ts`

**Interfaces:**
- Consumes: `Api.buildingPlan`, `edit`, `MapData.buildings/plaza`, `makeLayout`, `BUILDING_ITEM_TILES`, `PLAZA_ITEM_TILES`, `itemToWorld`, `buildingTypeName`, `isKnownBuildingType`.
- Produces (`buildingTool.ts`, all pure):
  - `export type Target = { kind: "building"; slot: number } | { kind: "plaza" };`
  - `export function hitTarget(map: MapData, acreW: number, tile: {x:number;y:number}): Target | null` (item-layer tile → target under it; buildings win over the plaza, empty slots ignored)
  - `export function targetRect(map, acreW, t: Target): { x: number; y: number; w: number; h: number }` (item-layer coordinates, may be negative/outside for ghost drawing)
  - `export function moveOp(map, acreW, t: Target, to: {x:number;y:number} /* item coords of top-left */): BuildingEditOp`
  - `export function fieldOp(map, slot: number, patch: Partial<BuildingInfo>): BuildingEditOp`
  - `export function deleteOp(map, slot: number): BuildingEditOp`
  - `export function addOp(map, type: number, at: {x:number;y:number}): BuildingEditOp | null` (null when all 46 slots are in use; uses the first slot with type 0 and the smallest unused uniqueId ≥ 1)
  - `export function freeSlots(map): number`
- Panel behavior: lists target (type dropdown named via `buildingTypeName`; angle, subType, typeArg, bit, uniqueId, position inputs; "unverified" badge on subType/typeArg/bit and a "ground rule unverified" note for bridge/incline), Delete, "Add building" (type dropdown + click on the map; ghost follows hover; message "All 46 building slots are in use." when `freeSlots` is 0). Each field change/delete/add: `api.buildingPlan(op)`; if `ok` → `edit(op)`, else `showToast(reason)` and the input reverts. Plaza: its own row with X/Z.
- Map gestures (in `MapSection`'s `paint` sink when `tool === "building"`): `start` hit-tests and selects (grab offset = tile − target top-left); `move` updates a drag ghost via `moveOp` + `buildingPlan` (green/red, red shows reason in the existing status line); `end` commits via `edit(op)` if valid else keeps the old position and toasts the reason; with no drag the selected target shows as a green outline ghost. All plan calls are async: ignore stale results with a token as `MapSection` already does for `load`.

- [ ] **Step 1: Failing tests** in `tests/unit/buildingTool.test.ts`: `hitTarget` returns slot 2 on its 4x4 corners and null just outside, the plaza on its 24x20 area, building over plaza where they overlap in the fixture; `moveOp` for a building changes only x,y (angle/type/uniqueId/subType/typeArg/bit preserved); plaza `moveOp` sets `plaza` and no `changes`; `addOp` picks the first empty slot and uniqueId = smallest unused ≥ 1, returns null with 46 full slots; `deleteOp` yields a type-0 building; `fieldOp` patches one field only.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `buildingTool.ts`, then the Svelte panel and wiring (UI has no unit test; covered by Task 8 e2e). **Step 4:** `bun test tests/unit/buildingTool.test.ts && bun run typecheck && bun run build` → pass. **Step 5: Commit** `Map: buildings tool`.

---

### Task 8: End-to-end, docs, final verification

**Files:**
- Create: `tests/e2e/buildingEdit.spec.ts` (pattern of `tests/e2e/mapEdit.spec.ts`)
- Modify: `docs/superpowers/HANDOFF.md`

- [ ] **Step 1: Write the e2e** (skips without `NHSE_TEST_SAVE`): open the example save zip, Map → Edit → Buildings tool; select a building through the panel list or by clicking it; change its X via the panel by +4 (valid) → status/history shows one more unsaved change and the position field shows the new value; undo via the toolbar button → original value; redo; save to a zip, reload that zip, assert the position persists; then enter a position overlapping another building and assert the refusal message (`/overlaps building/`) appears and the unsaved-change count does not grow.
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test` → all e2e pass (now 5).
- [ ] **Step 3: Full verification** (`superpowers:verification-before-completion`): `dotnet build reference -c Release && NHSE_TEST_SAVE=$PWD/example-save-file bun test && bun run typecheck && bun run build`; record counts.
- [ ] **Step 4: Update HANDOFF.md**: add P2b to State/Architecture facts (op shape, rules, `structures` snapshot, tool files, oracle command) and Known gaps (unverified single-instance/bridge/ground rules, subType/typeArg/bit free). **Commit** `Docs: handoff after buildings editor`.
- [ ] **Step 5: Final report to the user** listing all `Ruling:` lines from every task commit (`git log --format=%B <base>..HEAD | grep Ruling:`).
