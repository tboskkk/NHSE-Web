# Map editor P2a: items and bulk cleanup — design

Sub-project 1 of 3 of the map editor (P2a items, P2b buildings, P2c terrain; each gets its own spec/plan/merge, in that order).
Builds on the read-only viewer (`2026-11-22-map-viewer-design.md`). Owner's goal: edit the island in a modern browser editor with
**strict** edits: anything that would break the game is refused.

## Scope
In: place/erase/rectangle/eyedropper/drag-paint tools, layer 1 and layer 2, item variants and patterns, bulk actions
(remove all weeds, remove all of X, replace A with B), map undo/redo through the shared undo stack.
Out: buildings, plaza, terrain, acre changes, room/interior layers, item flag *editing* as a user feature, 3D, sprite generation.

## Rules (core, pure TS, `packages/core/src/map/`)
- **Op:** one new `EditOp` `mapEdit { layer: 0|1, changes: {x, y, raw}[] }` (raw = 16-hex u64, same encoding as other items). Max 55,296 changes (a full layer).
- **Footprint:** size from generated item data (`ItemInfo.GetItemSize` equivalent); odd rotation swaps width/height. Root tile holds the item;
  every other footprint tile is an extension tile: item id `0xfffd`, `ExtensionItemId` = root id, `ExtensionX/Y` = offset from the root (upstream `SetExtensionTiles`).
  Erase and replace always remove the whole footprint (upstream `Item.Delete` semantics).
- **Strict validity** (validated for the whole op before any byte changes; first failure aborts with a reason):
  1. every footprint tile inside the item area; 2. ground buildable (not water, sea, river, cliff or rock per the terrain layer);
  3. footprint does not overlap a building or the plaza; 4. footprint does not overlap an existing item on that layer (replace removes the old footprint first).
  Per-item game rules not present in save data or upstream (e.g. flower-on-grass only) are NOT enforced; stated plainly in the UI help.
- **Flags** (correction from design discussion): item flags are 1 bit per tile, row-major (`y*width + x`, width 288 on 3.0+; 6912 bytes), tiles are column-major. Upstream's editor never sets flags on placement.
  So placement sets no flag; erase/replace/overwrite clears the flag bit of every tile whose item was removed (an active flag on an empty tile is flagged anomalous upstream). First plan task: confirm against the oracle and a real save that existing saves follow this; if not, record a ruling.
- **Oracle:** `reference/` gets a `map-edit` command applying the same changes through upstream code; golden tests require byte-identical tiles and flags.

## Worker, undo, state
- `applyOp`/`validateOp`/`describeOp` handle `mapEdit`; marks only `main.dat` dirty; existing verified save is unchanged.
- Undo/redo: the shared `EditSession` stack stores a diff (old/new raw per changed tile, old/new flag bits). One stroke, rectangle or bulk action = one undo step. Ctrl+Z spans player and map edits in order.
- After edit/undo/redo the worker returns only changed tiles; the map store patches layers in place and the scene redraws only affected sprites (no full-layer re-transfer).
- Bulk actions are computed in the worker as one `mapEdit`. UI first requests a dry run (counts per layer, skipped tiles), applies on confirm. Replace A→B skips tiles where B does not fit and reports how many.

## UI (Map section, edit mode)
- View/Edit toggle (View is today's viewer). Edit is disabled until a hash-warning banner is dismissed.
- Item picker reuses the player editor catalog picker (search, variants, patterns); brush chip; eyedropper copies item and variant.
- Target layer selector (other layer dimmed, not editable). Tools: place (click + drag-paint), erase, rectangle fill/clear, eyedropper, bulk panel.
- Footprint ghost under the cursor, green valid / red invalid, refusal reason in a status line; invalid tiles in a drag/rectangle are skipped and counted. Without a sprite pack the ghost is a labeled colored box, so editing needs no art.
- A stroke commits on pointer release (one op). Space or middle-drag pans; touch: one finger tool, two fingers pan/zoom. Undo/redo = existing buttons and Ctrl+Z.
- Viewer fix included: multi-tile items drawn at their footprint size (currently 1x1).

## Testing
- Unit: footprint math (rotation, bounds), each validity rule and its reason, diff/undo/redo round trip, bulk dry run counts, flag clearing.
- Golden: `map-edit` oracle byte-identical for tiles and flags (place, multi-tile, rotated, erase, replace, overlap-refusal parity).
- Playwright: place item, undo, redo, save, reload, assert tile; one bulk action with confirm; refused placement shows reason.
- Real-save check: footprints of furniture in the example save match computed footprints.

## Success criteria
1. Any accepted edit produces a save whose item layers and flags match upstream's editor byte for byte for the same operation.
2. Any edit violating the strict rules is refused with a reason and changes no bytes.
3. Undo/redo restores exact prior bytes (tiles and flags) and a saved-then-reloaded save shows the edits.
4. All six tools and the three bulk actions work on layer 1 and 2; no edit blocks the UI for a full-layer operation (worker-side).

## Risks
- Flag semantics beyond "clear on remove" are unverified; mitigation is the first-task confirmation and keeping flags untouched elsewhere.
- Buildable-ground rule depends on a terrain-class mapping; derived from the existing terrain palette classes and verified against upstream collision data in the oracle.
