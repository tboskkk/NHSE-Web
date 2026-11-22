# Map editor P2b: buildings and plaza — design

Sub-project 2 of 3 of the map editor (P2a items done, P2c terrain next). Builds on `2026-11-22-map-editor-items-design.md`.
Goal: move, add, remove and retype the 46 building slots and move the plaza, with **strict** edits (anything that would break
the game is refused), verified byte-identical against the C# oracle, undoable through the shared undo stack.

## Scope
In: move/add/delete/retype buildings (all fields upstream exposes), move the plaza, ghost + inspector UI, undo/redo.
Out: terrain, building interiors, villager/house assignment, items inside buildings, 3D, sprite generation.
Upstream (`FieldItemEditor`) edits these as raw number boxes with no validation; we add validation, never loosen byte behaviour.

## Decisions (from brainstorming)
1. Scope is everything upstream can do, including free retyping.
2. Items under a new footprint: **refuse** (no auto-clear). The reason states how many items are in the way; the user clears them with the item tools.
3. Non-position fields: **guarded** (rules below); subtype/typeArg/bit free but labeled unverified.
4. Ground: **split rule**. Ordinary buildings and the plaza need buildable ground; bridges and inclines skip it.

## Core (pure TS, `packages/core/src/map/`)
- **Op:** `buildingEdit { label, changes: {slot: 0..45, building: Building20}[], plaza?: {x, z} }`. `Building20` = the 0x14-byte layout
  (type u16 @0, x u16 @2, y u16 @4, angle u8 @6, bit i8 @7, subType u16 @8, typeArg u8 @10, uniqueId u16 @12, 4 unused bytes @16 preserved on
  retype/move and zeroed on clear, matching `Building.Clear/CopyFrom`). Marks only `main.dat` dirty.
- **`planBuildingEdit` (pure):** computes the final state of all slots and the plaza, then validates the whole final state touched by the op
  before any byte changes; first failure aborts with a reason and changes no bytes. Undo is the existing byte-patch `EditSession`.
- **Rules** (a rule applies to an entry only if the op changes that slot/plaza, so a save that already breaks a rule does not block unrelated edits):
  1. Footprint inside the item area: buildings 4x4 item tiles, plaza 24x20 (`geometry.ts` constants); coordinates are whole tiles.
  2. No overlap with another building (type != 0) or the plaza in the final state.
  3. No overlap with any item on layer 1 or 2 (any non-empty tile incl. extension tiles); reason includes the item count.
  4. Ground: every footprint tile buildable (same `groundAt` classes as item placement) for buildings other than bridge (26) and incline (27) and for the plaza; bridge/incline are exempt (UI: "ground rule unverified").
  5. Fields: type is 0 or a known upstream value (1-29, 42); angle 0-3; uniqueId unique across non-empty slots; type value unique across slots except 0, 26 (bridge), 27 (incline).
  6. Clearing a slot (type 0) zeroes all 20 bytes.
- Existing placement refusal against buildings/plaza keeps working and must agree with the new geometry (shared constants).
- Coordinate units: stored x/y are treated as world item-tile units (as the viewer and item rules do). Upstream converts relative<->absolute (`rel*2 + 32`); **first plan task confirms the stored-unit reading against the oracle and the example save and records a `Ruling:`** if it differs.

## Oracle
`reference/` gets a `building-edit` command (and `EditOp` mirror in `Commands/Edit.cs`) applying the same changes via upstream `Building.CopyFrom/Clear`, `MapStatePlaza`, `Building.SetArray`. Golden tests require byte-identical `main.dat` for: move, retype, clear, add into an empty slot, swap two slots, plaza move, and refusal parity (overlap, bounds, duplicate id) where upstream-equivalent state must be unchanged.

## Worker, undo, state
- `applyOp`/`validateOp`/`describeOp` handle `buildingEdit` (ranges validated before bytes are touched); worker returns the updated buildings/plaza after edit/undo/redo and `mapStore` patches them in place. Ctrl+Z spans player, item and building edits in order.
- `api.buildingPlan` plans without editing (ghost validity) and returns the refusal reason.

## UI (Map edit mode, "Buildings" tool)
- Click a building or the plaza to select; drag with a ghost (green valid, red invalid + reason); commit on release (one undo step).
- Inspector: type (named dropdown), angle, subtype, typeArg, bit (unverified badge), uniqueId (auto-suggest a free id), position, Delete. Plaza row with X and Z.
- Add building: first empty slot, click-to-place with the same ghost. Without a sprite pack, boxes are labeled colored squares.
- Edit mode stays gated on the hash-warning banner (as P2a).

## Testing
- Unit: each rule and reason, clear/swap/chain cases, rules scoped to changed entries, undo/redo round trip, unused-bytes preservation.
- Golden: oracle byte-identical (list above). Real-save check: the example save's buildings pass the rules or are the documented exceptions.
- Playwright: move a building, undo, save, reload, assert position; a move onto an item is refused with its reason.

## Success criteria
1. Every accepted edit yields `main.dat` byte-identical to upstream applying the same change.
2. Every rule violation is refused with a reason and changes no bytes.
3. Undo/redo restores exact bytes; save + reload shows the edit.
4. All of move, add, delete, retype and plaza move work from the UI.

## Risks
- Single-instance and bridge/incline rules are inferred, not from game data; labeled in the UI, checked against the example save in the first plan task.
- Stored coordinate units (above).
- Retyping can produce a combination the game dislikes (subtype/typeArg unverified); accepted per decision 3.
