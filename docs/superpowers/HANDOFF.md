# Handoff — NHSE-Web foundation (paused before Task 7)

**Branch:** `feat/foundation` · **Plan:** `docs/superpowers/plans/2026-11-22-nhse-web-foundation.md` · **Spec:** `docs/superpowers/specs/2026-11-22-nhse-web-foundation-design.md`
**Executing:** inline via `superpowers:executing-plans`. Ledger (git-ignored, authoritative): `.superpowers/sdd/2026-11-22-nhse-web-foundation/progress.md` — tasks 1–6 are `complete`; resume at **Task 7**. If the ledger is gone, trust `git log`.

## Resume
```
export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH      # .NET 10 SDK lives in ~/.dotnet (reference CLI only)
git submodule update --init                            # vendor/NHSE pinned at cb074541…
bun install
NHSE_TEST_SAVE=$PWD/example-save-file bun test         # 49 tests, all pass (golden tests skip without the env var)
dotnet build reference -c Release                      # golden tests use `dotnet run --no-build`, so build first
S=~/.claude/plugins/cache/superpowers-marketplace/superpowers/6.4.2/skills/executing-plans/scripts
$S/task-start docs/superpowers/plans/2026-11-22-nhse-web-foundation.md 7
```
`example-save-file/` is git-ignored (personal IDs) — never commit it.

## State
- Done: reference C# CLI · crypto + bytes · generated data (revisions/items/9 languages/sprites) · HorizonSave load/hash/save/verify · Personal/Item/GameStrings · EditSession.
- Verified byte-identical vs upstream NHSE.Core: decrypt, hash regions, same-seed re-encrypt, every Personal field + item name.
- Next: **Task 7** (`packages/core/src/edit/ops.ts` + implement `reference/Commands/Edit.cs`, golden edit tests), then 8 io, 9 worker API, 10–12 Svelte UI, 13 E2E/CI/Pages, 14 real-game acceptance. Then final whole-branch review.

## Rulings & gotchas that later tasks depend on (full list in the ledger)
- `HorizonSave.save(seed, only?, {encryptFn?})` hashes+encrypts only the emitted pairs; pair paths have no extension (`"main"`, `"Villager0/personal"`). `passthrough` holds non-pair files (landname.dat) — include them in the "save all" zip.
- **Task 9 must call `session.markSaved()` after `build()`** (save-time hashing mutates pair data). `EditSession<T>.apply(label, fn(target))` rolls back if fn throws.
- `EditSession` is constructed from anything with `pairs()`; golden/unit tests use stubs.
- Naming (NHSE): `"pocket"` = slots 1–20 (Pockets2), `"bag"` = slots 21–40 (Pockets1); `slotCount()` = physical slots (20/20/9000), `pocketCount/bagCount/itemChestCount` = unlocked counters.
- Item `raw` strings everywhere = u64 as lowercase 16-digit hex (`Item.NONE` = `"000000000000fffe"`).
- items.json extras (my additions): `kindGroups`, `fieldItems`, `menuIconFiles`; remake = `{body:int[], fabric:int[]}` valid variant indices; lang JSON has `noneName` (empty-slot name = `itemlist[0]`).
- Example save is 3.0.3: player "Tyler", town "Home", wallet 38003, itemChestCount 80 unlocked of 9000.
