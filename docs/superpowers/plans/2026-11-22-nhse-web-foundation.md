# NHSE-Web Foundation + Player Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load, edit (Player basics), and save ACNH 1.0–3.0.3 saves in the browser, proven byte-identical to upstream `NHSE.Core`.

**Architecture:** A TypeScript port of `NHSE.Core` (`packages/core`) works on raw `Uint8Array` buffers. Browser file I/O lives in `packages/io`. A Svelte 5 app (`app/`) drives the core through a Web Worker. Version tables (revisions, hash regions, offsets) and item metadata are **exported from upstream by a C# reference CLI** (`reference/`) instead of being hand-transcribed. The same CLI is the oracle for golden tests.

**Tech Stack:** Bun (workspaces, `bun test`), TypeScript strict, Vite + Svelte 5, WebCrypto (AES-CTR), fflate (zip), Playwright, .NET 10 SDK (reference only), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-11-22-nhse-web-foundation-design.md`

## Global Constraints

- License GPLv3. The README credits kwsch and the NHSE contributors and links https://github.com/kwsch/NHSE.
- Upstream is pinned as a git submodule at `vendor/NHSE`, commit `cb0745415945776f73375bf0a434a8babf059307`. Every "port X" step means: port `vendor/NHSE/<path>` faithfully, keeping names camelCased.
- `packages/core` must not import DOM, Svelte, or `packages/io`. Dependency direction is `app → io → core`.
- `example-save-file/` is never committed. Golden and E2E tests read `NHSE_TEST_SAVE` and **skip** when it is unset.
- Nothing is ever written into the user's save folder except `*.dat`/`*Header.dat` pairs that changed.
- Loading fails with a specific message on an unknown revision or a size mismatch. Never guess.
- Every save runs hash → encrypt (fresh random u32 seed) → verify (decrypt + compare + recheck hashes). Abort on any mismatch.
- Range limits (UI, can be lifted with the "advanced" toggle): wallet ≤ 99,999; bank ≤ 999,999,999; pocket/bag unlocked counts ≤ 20; storage unlocked count ≤ `itemChestCount` slots for the revision; other EncryptedInt32 values ≤ 4,294,967,295. Checksum and format integrity are never bypassable.
- The app's UI text is English. Game text uses the selected language (default `en`). Codes: `de en es fr it jp ko zhs zht`.
- No network requests carrying save data. No analytics.

## Review Focus

1. **Multi-player saves (Villager0…Villager7)**: every resident loads, appears in the sidebar, and saves. Test: Task 4 synthesizes a second player directory by copying `Villager0` to `Villager1`.
2. **Folder picked one level above, or a zip with a wrapper folder** (e.g. `MySave/main.dat`): loading still finds the save root. Test: Task 8 `findSaveRoot` cases.
3. **A player rename longer than 10 characters or containing non-BMP characters**: it is truncated to 10 UTF-16 units, never overflows into adjacent bytes, and identity replacement updates every file. Test: Task 5.
4. **Undo past a save, or editing after a save**: undo still restores exact bytes, and the "changed files" set stays correct for the next in-place write. Test: Task 6.
5. **A save whose hashes are already invalid**: it loads with a warning listing the regions, and saving fixes them rather than refusing. Test: Task 4 (corrupt one byte inside a hashed region).

---

### Task 1: Reference CLI over upstream NHSE.Core

**Files:**
- Create: `.gitmodules`, `vendor/NHSE` (submodule), `reference/NHSE.Reference.csproj`, `reference/Program.cs`, `reference/Commands/{Vectors,Dump,Save,Edit,ExportData}.cs`, `reference/README.md`
- Modify: `.gitignore` (already ignores `reference/bin/`, `reference/obj/`)

**Interfaces:**
- Produces: `dotnet run --project reference -- <command>` with:
  - `vectors <out.json>`: `{ murmur3: [{hex, hash}], encInt: [{value, shift, adjust, encrypted, checksum}], encryption: [{seed, versionHeaderHex, dataHex, outHeaderHex, outDataHex}] }`. XorShift128 and AES-CTR are internal upstream, so they are verified through `Encryption.Encrypt`. Header bytes 0x100–0x300 are the raw XorShift128 stream.
  - `dump <saveDir> <outDir>`: writes `outDir/decrypted/<relpath>` (decrypted data and unchanged header for every pair) and `outDir/summary.json` = `{ revisionIndex, files: [{path, size, invalidHashes: [{hashOffset, start, length}]}], players: PlayerDump[] }`.
  - `save <saveDir> <seed> <outDir>`: copy saveDir → outDir, load from outDir, `HorizonSave.Save(seed)`.
  - `edit <saveDir> <ops.json> <seed> <outDir>`: copy, load, apply `EditOp[]` (schema in Task 7), save with seed.
  - `export-data <outDir>`: writes `revisions.json`, `items.json`, `lang/<code>.json` (schemas in Task 3).
  - `PlayerDump = { directory, playerName, townName, playerId, townId, wallet, bank, nookMiles, totalNookMiles, hotelTickets: number|null, pocketCount, bagCount, itemChestCount, birthday: {month, day}, profileBirthday: {month, day}, profileFruit, pocket: ItemDump[], bag: ItemDump[], itemChest: ItemDump[] }` and `ItemDump = { raw: string /* Item.RawValue.ToString("x16") */, name: string /* en GetItemName */ }`.

- [ ] **Step 1: Install the .NET 10 SDK user-locally.** Run `curl -sSL https://dot.net/v1/dotnet-install.sh -o "$SCRATCH/dotnet-install.sh" && bash "$SCRATCH/dotnet-install.sh" --channel 10.0 --install-dir ~/.dotnet`. Then `~/.dotnet/dotnet --version` should print `10.x`. Add `~/.dotnet` to PATH for the session (`export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH`).
- [ ] **Step 2: Add the submodule.** `git submodule add https://github.com/kwsch/NHSE vendor/NHSE && git -C vendor/NHSE checkout cb0745415945776f73375bf0a434a8babf059307`.
- [ ] **Step 3: Create `reference/NHSE.Reference.csproj`** (console, `net10.0`, `ProjectReference` to `../vendor/NHSE/NHSE.Core/NHSE.Core.csproj`) and `Program.cs` dispatching on `args[0]`. Use reflection for private or internal data: `RevisionChecker.RevisionInfo` (private static field), every public `int` property of `PersonalOffsets.GetOffsets(info)` plus `Offset30s_064c1881` when it implements `IPersonal30`, and `FileHashRevision` regions via `RevisionChecker.HashInfo`. Revision labels are a hard-coded array of the 35 version strings `"1.0.0"…"3.0.3"` in `RevisionChecker` order.
- [ ] **Step 4: Verify each command against the example save.** Run `dotnet run --project reference -- dump example-save-file $SCRATCH/dump`. Expected: `summary.json` has `revisionIndex: 34`, one player whose `directory` is `Villager0`, and `invalidHashes` empty for every file. Run `vectors`, `export-data` and `save` with seed `305419896` and check that each writes output without exceptions.
- [ ] **Step 5: Commit**: `git add .gitmodules vendor/NHSE reference && git commit -m "Add C# reference CLI over pinned upstream NHSE.Core"`.

---

### Task 2: Workspace scaffold + crypto port

**Files:**
- Create: `package.json` (workspaces `packages/*`, `app`; scripts `test`, `typecheck`, `build`, `dev`, `gen:data`, `vectors`), `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), `LICENSE` (GPLv3 text), `README.md`, `packages/core/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/core/src/util/bytes.ts`, `packages/core/src/crypto/{xorshift128,murmur3,encryptedInt32,aesCtr,encryption}.ts`
- Create: `scripts/vectors.ts` (runs the reference `vectors` → `tests/fixtures/vectors.json`, committed), `tests/unit/crypto.test.ts`

**Interfaces:**
- Produces:
  - `bytes.ts`: `u16(d: Uint8Array, o: number): number`, `u32`, `setU16`, `setU32`, `getUtf16(d, o, maxChars): string` (stops at first `\0`), `setUtf16(d, o, s, maxChars): void` (truncate or pad with `\0` to exactly `maxChars` UTF-16 units), `replaceOccurrences(d, pattern, replacement): number`.
  - `class XorShift128 { constructor(seed: number); next(): number /* u32 */; next64(): bigint }`
  - `murmur3(data: Uint8Array, seed = 0): number`
  - `EncryptedInt32 { static read(d, o): EncInt; static readVerify(d, o): EncInt /* throws on checksum */; static write(v: EncInt, d, o): void; static calcChecksum(enc: number): number }` with `type EncInt = { value: number; adjust: number; shift: number; checksum: number }`. `write` re-encrypts `value` with the stored `shift`/`adjust` and writes the fresh checksum. Port `vendor/NHSE/NHSE.Core/Encryption/EncryptedInt32.cs`.
  - `aesCtr(data: Uint8Array, key: Uint8Array, counter: Uint8Array): Promise<Uint8Array>` via `crypto.subtle` `AES-CTR` with `length: 128` (a big-endian 128-bit increment matches upstream `IncrementCounter`).
  - `decrypt(header: Uint8Array, enc: Uint8Array): Promise<Uint8Array>` and `encrypt(data: Uint8Array, seed: number, header: Uint8Array): Promise<{ data: Uint8Array; header: Uint8Array }>`. Port `Encryption.cs` (GetParam, GenerateHeaderFile).

- [ ] **Step 1: Scaffold.** `bun init` equivalents per the file list. `bun install` must succeed and `bun run typecheck` must pass on an empty `index.ts`.
- [ ] **Step 2: Generate vectors.** `bun run vectors` writes `tests/fixtures/vectors.json` (≥ 8 murmur3 cases including empty and 0x1000-byte inputs, ≥ 8 encInt cases including shift 0/31 and adjust 0/0xFFFF, ≥ 3 encryption cases including a data length that is not a multiple of 16).
- [ ] **Step 3: Write failing tests** in `tests/unit/crypto.test.ts`:

```ts
import v from "../fixtures/vectors.json";
test("murmur3 matches upstream", () => { for (const c of v.murmur3) expect(murmur3(hex(c.hex))).toBe(c.hash); });
test("EncryptedInt32 round-trips upstream encodings", () => {
  for (const c of v.encInt) {
    const buf = new Uint8Array(8); EncryptedInt32.write({ value: c.value, shift: c.shift, adjust: c.adjust, checksum: 0 }, buf, 0);
    expect(u32(buf, 0)).toBe(c.encrypted); expect(buf[7]).toBe(c.checksum);
    expect(EncryptedInt32.readVerify(buf, 0).value).toBe(c.value);
  }
});
test("readVerify throws on bad checksum", () => { const b = new Uint8Array(8); expect(() => EncryptedInt32.readVerify(b, 0)).toThrow(); });
test("encrypt matches upstream bytes and decrypt inverts it", async () => {
  for (const c of v.encryption) {
    const out = await encrypt(hex(c.dataHex), c.seed, hex(c.versionHeaderHex));
    expect(toHex(out.header)).toBe(c.outHeaderHex); expect(toHex(out.data)).toBe(c.outDataHex);
    expect(toHex(await decrypt(out.header, out.data))).toBe(c.dataHex);
  }
});
```

- [ ] **Step 4: Run** `bun test tests/unit/crypto.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 5: Implement** the crypto modules listed under Interfaces. All u32 arithmetic uses `>>> 0` and `Math.imul`.
- [ ] **Step 6: Run** `bun test tests/unit` and `bun run typecheck`. Expected: PASS.
- [ ] **Step 7: Commit**: `git commit -am "Scaffold Bun workspace and port crypto primitives"` (add new files first).

---

### Task 3: Generated data (revisions, items, strings, sprites)

**Files:**
- Create: `scripts/gen-data.ts`, `packages/core/src/generated/{revisions.json,items.json}`, `app/public/data/lang/<code>.json` (9 files), `app/public/sprites/menuicon/*.png`, `app/public/sprites/leaf.png`
- Create: `packages/core/src/save/revisions.ts`, `packages/core/src/items/itemInfo.ts`, `tests/unit/generated.test.ts`

**Interfaces:**
- Consumes: reference `export-data` (Task 1).
- Produces:
  - `revisions.json`: `Revision[]`, where `Revision = { index, label, header: {major, minor, unk1, headerRevision, unk2, saveRevision}, sizes: {main, personal, photoStudioIsland, postBox, profile, whereAreN}, hash: { [fileName: string]: { size, regions: {hashOffset, start, length}[] } }, personalOffsets: Record<string, number> }`.
  - `items.json`: `{ kind: number[], kindNames: string[], menuIcon: number[], menuIconNames: string[], recipes: Record<string, number> /* recipeId → itemId */, remake: Record<string, { bodyCount: number; fabricCount: number }>, flowerGeneNames: Record<string, number> }`.
  - `lang/<code>.json`: `{ items: string[] /* GameStrings.itemlistdisplay */, remakeBody: Record<string, string[]>, remakeFabric: Record<string, string[]> }`.
  - `revisions.ts`: `findRevision(h: FileHeaderInfo): Revision | undefined`, `REVISIONS: readonly Revision[]`.
  - `itemInfo.ts`: `getKind(id): string` (kind name), `getMenuIconSprite(id): string` (URL path. The `Leaf` icon maps to `sprites/menuicon/Leaf.png`, unknown maps to `sprites/leaf.png`), `isFurniture/isClothing/isCrafting(id)` (port the `ItemKind` extension sets from `ItemKind.cs`), `isFlowerGene(id)`, `remakeInfo(id)`, `recipeItem(recipeId)`.
- `gen-data.ts` runs `export-data` into a temp dir, writes the outputs above, and copies `vendor/NHSE/NHSE.Sprites/Resources/MenuIcon/*.png` and `Resources/Misc/leaf.png`. Generated files are committed so CI needs no .NET.

- [ ] **Step 1: Write failing tests**:

```ts
test("35 revisions, 3.0.3 is index 34 with REV_300 sizes", () => {
  expect(REVISIONS.length).toBe(35);
  const r = REVISIONS[34]!; expect(r.label).toBe("3.0.3");
  expect(r.header).toMatchObject({ major: 0xA0002, minor: 0xA0028, saveRevision: 34 });
  expect(r.sizes.main).toBe(10161808); expect(r.sizes.personal).toBe(477760);
  expect(r.personalOffsets.Pockets1).toBe(0x37be0 + 0x10);
});
test("item tables line up", () => {
  expect(items.kind.length).toBe(14987);
  expect(en.items[0]).toBe("(None)");
  expect(getKind(0x16A2)).toBe("Kind_DIYRecipe");
});
```

- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `gen-data.ts`, run `bun run gen:data`, then implement `revisions.ts` and `itemInfo.ts`.
- [ ] **Step 4: Run** `bun test tests/unit`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Generate revision, item, string and sprite data from upstream"`.

---

### Task 4: Save model: load, hash, save, verify

**Files:**
- Create: `packages/core/src/save/{fileHeaderInfo,encryptedFilePair,horizonSave,errors}.ts`, `tests/golden/helpers.ts`, `tests/golden/save.test.ts`, `tests/golden/horizonSave.test.ts`

**Interfaces:**
- Consumes: `decrypt`/`encrypt`/`murmur3` (Task 2), `findRevision` (Task 3).
- Produces:
  - `type SaveFiles = Map<string, Uint8Array>`, with keys being POSIX paths relative to the save root (`"main.dat"`, `"Villager0/personalHeader.dat"`).
  - `class SaveLoadError extends Error { code: "missing-main" | "unknown-revision" | "size-mismatch" | "missing-player-file"; detail: string }`.
  - `class EncryptedFilePair { readonly path: string /* e.g. "Villager0/personal" */; data: Uint8Array; header: Uint8Array; readonly revision: Revision; hash(): void; invalidHashes(): HashRegion[] }`.
  - `class HorizonSave { static load(files: SaveFiles): Promise<HorizonSave>; readonly main: EncryptedFilePair; readonly players: Player[]; readonly revision: Revision; pairs(): EncryptedFilePair[]; invalidHashes(): { path: string; region: HashRegion }[]; save(seed: number, only?: Set<string>): Promise<SaveFiles> /* hash + encrypt + verify; only = pair paths to emit */ }`.
  - `class Player { readonly directory: string; personal: Personal /* Task 5; a plain EncryptedFilePair until then */; photo; postBox; profile; whereAreN?: EncryptedFilePair }`. Players come from directories matching `^Villager\d+$`, sorted numerically.
  - `tests/golden/helpers.ts`: `const SAVE = process.env.NHSE_TEST_SAVE`; `goldenTest(name, fn)` = `SAVE ? test(name, fn, 120_000) : test.skip(name, fn)`; `runReference(args: string[]): Promise<void>`; `readDir(dir): Promise<SaveFiles>`.

- [ ] **Step 1: Write failing golden tests** (`tests/golden/save.test.ts`):

```ts
goldenTest("decrypted bytes and hash results match upstream", async () => {
  await runReference(["dump", SAVE!, out]); const ref = JSON.parse(await Bun.file(`${out}/summary.json`).text());
  const sav = await HorizonSave.load(await readDir(SAVE!));
  expect(sav.revision.index).toBe(ref.revisionIndex);
  for (const p of sav.pairs()) {
    expect(Bun.hash(p.data)).toBe(Bun.hash(await Bun.file(`${out}/decrypted/${p.path}.dat`).bytes()));
    expect(p.invalidHashes()).toEqual(ref.files.find((f: any) => f.path === `${p.path}.dat`).invalidHashes);
  }
});
goldenTest("same-seed save is byte-identical to upstream", async () => {
  await runReference(["save", SAVE!, "305419896", out2]);
  const mine = await (await HorizonSave.load(await readDir(SAVE!))).save(305419896);
  const theirs = await readDir(out2);
  for (const [k, v] of mine) expect(Bun.hash(v)).toBe(Bun.hash(theirs.get(k)!));
});
```

- [ ] **Step 2: Write failing behaviour tests** (`tests/golden/horizonSave.test.ts`, using `goldenTest`, operating on in-memory copies of the save): `load` rejects `code: "unknown-revision"` when `mainHeader.dat` byte 0x0E is changed to 99. It rejects `code: "size-mismatch"` when `main.dat` is truncated by 16 bytes. Copying `Villager0/*` to `Villager1/*` yields `players.length === 2` and a save emitting both directories (Review Focus 1). XOR-ing one byte at `regions[0].start + 4` of decrypted `main` makes `invalidHashes()` non-empty, and after `save()` → `load()` it is empty (Review Focus 5; mutate the loaded `main.data`, then save). `save(seed, new Set(["Villager0/personal"]))` emits exactly 2 files. Verify failure: monkeypatch `encrypt` to flip a byte, and `save` rejects with `/verify/i`.
- [ ] **Step 3: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bun test tests/golden tests/unit`. Expected: FAIL.
- [ ] **Step 4: Implement** the save modules. Port `EncryptedFilePair.cs`, `HorizonSave.cs` (Save, GetInvalidHashes, ValidateSizes), `Player.cs`, and `FileHeaderInfo.cs`. `load` validates sizes against `revision.sizes` for every pair. A missing `whereAreN` pair is allowed (it is optional upstream).
- [ ] **Step 5: Run** the same command. Expected: PASS. Then run `bun test` without the env var. Expected: golden tests reported as skipped, no failures.
- [ ] **Step 6: Commit**: `git commit -m "Port save loading, hashing, and verified saving"`.

---

### Task 5: Personal, Item, and item names

**Files:**
- Create: `packages/core/src/save/personal.ts`, `packages/core/src/structures/{item,date}.ts`, `packages/core/src/strings/gameStrings.ts`, `tests/golden/personal.test.ts`, `tests/unit/item.test.ts`, `tests/unit/personal.test.ts`
- Modify: `packages/core/src/save/horizonSave.ts` (players use `Personal`; add `changeIdentity`)

**Interfaces:**
- Consumes: `EncryptedFilePair`, `Revision.personalOffsets`, `EncryptedInt32`, `bytes.ts`, `items.json`, `lang/*.json`.
- Produces:
  - `class Item { constructor(raw?: bigint); raw: bigint; itemId; systemParam; additionalParam; freeParam; count; useCount; bodyType; patternChoice; genes; get displayItemId(); isNone; isExtension; static NONE = 0xFFFE; static read(d, o): Item; write(d, o): void }`. Port `Item.cs` (fields, flag and wrapping accessors) except flower watering.
  - `class Personal extends EncryptedFilePair` with accessors that port `Personal.cs`: `townId, townName, playerId, playerName, wallet, bank, nookMiles, totalNookMiles` (as `EncInt`), `hotelTickets: EncInt | null` (null when not 3.0 or `IsInitialized30` is false), `pocketCount, bagCount, itemChestCount`, `birthday, profileBirthday: {month, day}`, `profileFruit`, `getItems(area: "pocket" | "bag" | "itemChest"): Item[]`, `setItem(area, slot, item)`, `slotCount(area): number` (20 / 20 / revision `ItemChestCount`, which is `0x11944 / 8 = 9000` for 3.0), `townIdentity(), playerIdentity(): Uint8Array` (copies).
  - `HorizonSave.changeIdentity(original: Uint8Array, updated: Uint8Array): void` (replace in `main` and every player pair).
  - `GameStrings.load(lang: string, fetcher: (path) => Promise<unknown>): Promise<GameStrings>` and `getItemName(item: Item): string` (port `GameStrings.GetItemName`. Flower genes are formatted like .NET `[Flags]` enum `ToString`: comma-space-joined names of the set flags in ascending value order, or the decimal number if any bit has no name) and `getItemNameById(id): string` (`"???"` past the table, `"Lloyd"` for 63005).

- [ ] **Step 1: Write failing golden test**: for every player, every `PlayerDump` field equals the TS reading. Items are compared as `{ raw: item.raw.toString(16).padStart(16, "0"), name: strings.getItemName(item) }`. Everywhere in this plan, an item `raw` string means the u64 value in lowercase 16-digit hex, so `Item.NONE` is `"000000000000fffe"` for every slot in all three areas.
- [ ] **Step 2: Write failing unit tests**: the `Item` raw round-trip and bitfields (`bodyType` uses the low 3 bits of `freeParam`; setting `patternChoice` keeps the low 5 bits). Writing a new wallet value keeps `shift`/`adjust` and `readVerify` succeeds. `playerName = "ABCDEFGHIJKLMNOP"` reads back `"ABCDEFGHIJ"` and leaves the 4 bytes after the 20-byte field unchanged (Review Focus 3). A name containing `"😀"` written at the boundary does not exceed 20 bytes. Renaming via the identity flow changes every occurrence of the old 24-byte identity in all pairs (count before > 0, count after = 0).
- [ ] **Step 3: Run**. Expected: FAIL.
- [ ] **Step 4: Implement.** In the app (Task 11), renames follow the upstream editor order: copy the old identity, set the name, then call `changeIdentity`. Implement that sequence as `renamePlayer(save, playerIdx, name)` and `renameTown(save, name)` (town rename applies through player 0's town identity) in `personal.ts`, and use them everywhere.
- [ ] **Step 5: Run** `NHSE_TEST_SAVE=… bun test`. Expected: PASS.
- [ ] **Step 6: Commit**: `git commit -m "Port Personal, Item, and item name resolution"`.

---

### Task 6: Edit session with byte-patch undo/redo

**Files:**
- Create: `packages/core/src/edit/session.ts`, `tests/unit/session.test.ts`

**Interfaces:**
- Consumes: `HorizonSave`.
- Produces:
  - `type Patch = { path: string /* pair path */; offset: number; before: Uint8Array; after: Uint8Array }`
  - `class EditSession { constructor(save: HorizonSave); apply(label: string, fn: (s: HorizonSave) => void): Change | null /* null when no bytes changed */; undo(): Change | null; redo(): Change | null; readonly changes: readonly Change[] /* applied, oldest first */; dirtyPairs(): Set<string> /* pairs whose bytes differ from the last markSaved() baseline */; markSaved(): void }` with `type Change = { label: string; patches: Patch[] }`.
  - Mechanism: keep a shadow copy of every pair's `data`. After `fn`, diff each pair against its shadow, coalesce runs separated by ≤ 8 equal bytes into one `Patch`, then update the shadow. Undo writes `before` and redo writes `after`, both into data and shadow. A new `apply` clears the redo stack. `dirtyPairs` compares against a baseline snapshot taken at load and at each `markSaved()`.

- [ ] **Step 1: Write failing tests** (using a tiny synthetic `HorizonSave`-shaped stub with two 64-byte pairs. Have `EditSession` accept anything with `pairs()`): `apply` that changes bytes 3 and 9 of pair A yields one patch (offset 3, length 7). One that changes bytes 3 and 20 yields two patches. A no-op returns null and is not recorded. `undo` restores exact bytes and `redo` reapplies them. A new edit after an undo clears redo. After `markSaved()`, editing pair B and undoing it gives `dirtyPairs()` = `{}`. Editing, `markSaved()`, then undoing gives `dirtyPairs()` = `{A}` (Review Focus 4).
- [ ] **Step 2: Run** `bun test tests/unit/session.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `session.ts`.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Add byte-patch edit session with undo/redo"`.

---

### Task 7: Edit operations + golden edit tests

**Files:**
- Create: `packages/core/src/edit/ops.ts`, `tests/golden/edits.test.ts`, `tests/fixtures/edit-ops.json`
- Modify: `reference/Commands/Edit.cs` (implement the same op schema)

**Interfaces:**
- Consumes: `Personal`, `renamePlayer`, `renameTown`, `Item`.
- Produces: `type EditOp =`
  `| { op: "wallet" | "bank" | "nookMiles" | "totalNookMiles" | "hotelTickets"; player: number; value: number }`
  `| { op: "pocketCount" | "bagCount" | "itemChestCount"; player: number; value: number }`
  `| { op: "playerName"; player: number; value: string } | { op: "townName"; value: string }`
  `| { op: "birthday"; player: number; month: number; day: number } /* writes birthday AND profileBirthday, as upstream MiscPlayerEditor does */`
  `| { op: "profileFruit"; player: number; value: number }`
  `| { op: "setItem"; player: number; area: "pocket" | "bag" | "itemChest"; slot: number; raw: string /* 16 hex */ }`
  `| { op: "moveItem"; player: number; from: {area, slot}; to: {area, slot} } /* swap */`
  `| { op: "batch"; label: string; ops: EditOp[] } /* TS only; one undo step; describeOp returns label */`.
  Also `applyOp(save: HorizonSave, op: EditOp): void` and `describeOp(save, strings: GameStrings, op): string` (e.g. `"Pocket slot 4: Bells → Golden shovel"`, `"Wallet: 1,200 → 99,999"`).
  The app only edits through `session.apply(describeOp(...), s => applyOp(s, op))`.

- [ ] **Step 1: Write the fixture** `edit-ops.json`: the scenarios `wallet=12345`, `bank=999999999`, `nookMiles=50000`, `playerName="Tester"`, `birthday 7/4`, `setItem pocket slot 2 = Golden shovel` (look up its id in `en.items` while writing the fixture), `moveItem pocket 0 → bag 5`, `itemChestCount=5000`, plus one scenario combining all of them.
- [ ] **Step 2: Write the failing golden test**: for each scenario, run the reference `edit` with seed `305419896` and the TS `applyOp` over all ops then `save(305419896)`, and assert every output file is byte-identical. Add unit tests for `describeOp` text on two ops, and check that a `batch` of 3 `setItem` ops produces exactly one `EditSession` history entry.
- [ ] **Step 3: Run**. Expected: FAIL.
- [ ] **Step 4: Implement** `ops.ts` and the matching C# `Edit.cs` (using upstream APIs only: `Personal` setters, `HorizonSave.ChangeIdentity`, `Item` raw).
- [ ] **Step 5: Run** `NHSE_TEST_SAVE=… bun test`. Expected: PASS.
- [ ] **Step 6: Commit**: `git commit -m "Add edit operations verified byte-identical against upstream"`.

---

### Task 8: Browser I/O package

**Files:**
- Create: `packages/io/{package.json,tsconfig.json}`, `packages/io/src/{saveRoot,zip,fsAccess,download,index}.ts`, `tests/unit/io.test.ts`

**Interfaces:**
- Consumes: `SaveFiles` (Task 4). Dependency: `fflate`.
- Produces:
  - `findSaveRoot(entries: Map<string, Uint8Array>): SaveFiles`. This locates the shallowest directory containing both `main.dat` and `mainHeader.dat`, re-keys paths relative to it, and drops files outside it. It throws `SaveLoadError("missing-main")` if none is found.
  - `fromFileList(files: FileList | File[]): Promise<SaveFiles>` (uses `webkitRelativePath`; a single `.zip` file goes through `fromZip`), `fromDataTransfer(dt: DataTransfer): Promise<SaveFiles>` (recursive `webkitGetAsEntry`), `fromZip(bytes: Uint8Array): Promise<SaveFiles>`, `toZip(files: SaveFiles, rootName: string): Uint8Array`.
  - `supportsFsAccess(): boolean`, `openFolder(): Promise<{ handle: FileSystemDirectoryHandle; files: SaveFiles }>` (`showDirectoryPicker({ mode: "readwrite" })`, resolved through `findSaveRoot`, with the root sub-handle kept), `writeFiles(root: FileSystemDirectoryHandle, files: SaveFiles): Promise<void>` (only the given keys, via `createWritable`).
  - `downloadBytes(bytes: Uint8Array, filename: string): void`, `backupName(island, date)` → `"<Island>_backup_YYYY-MM-DD_HH-mm.zip"`, `saveZipName(island, date)` → `"<Island>_YYYY-MM-DD.zip"` (characters invalid in filenames are stripped).

- [ ] **Step 1: Write failing tests**: `findSaveRoot` with keys `MySave/main.dat`, `MySave/mainHeader.dat`, `MySave/Villager0/personal.dat` gives `main.dat` and `Villager0/personal.dat` (Review Focus 2). A root at depth 0 works unchanged. Two candidates pick the shallowest. No `main.dat` throws `missing-main`. `toZip` → `fromZip` round-trips bytes and keys under `rootName/`. `backupName("Home", new Date(2026,10,22,14,3))` gives `"Home_backup_2026-11-22_14-03.zip"`.
- [ ] **Step 2: Run** `bun test tests/unit/io.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The File System Access and DataTransfer functions are thin wrappers with no unit tests. E2E (Task 13) covers the zip path.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Add browser save I/O: folder, drag-drop, zip, in-place write"`.

---

### Task 9: Worker API

**Files:**
- Create: `app/{package.json,vite.config.ts,tsconfig.json,index.html}`, `app/src/worker/{handlers,worker,protocol}.ts`, `app/src/lib/api.ts`, `tests/unit/handlers.test.ts`

**Interfaces:**
- Consumes: `HorizonSave`, `EditSession`, `applyOp`, `describeOp`, `GameStrings`.
- Produces (`protocol.ts`):
  - `type LoadResult = { island: string; revisionLabel: string; players: { index: number; name: string; directory: string }[]; invalidHashes: { path: string; start: number }[] }`
  - `type PlayerView = { index; name; townName; playerId; townId; wallet; bank; nookMiles; totalNookMiles; hotelTickets: number | null; pocketCount; bagCount; itemChestCount; slotCounts: {pocket; bag; itemChest}; birthday: {month; day}; profileFruit; pocket: ItemView[]; bag: ItemView[]; itemChest: ItemView[] }` and `type ItemView = { raw: string; id: number; name: string; sprite: string; count: number; useCount: number; kind: string }`
  - `interface Api { load(files: SaveFiles, lang: string): Promise<LoadResult>; player(i: number): Promise<PlayerView>; edit(op: EditOp): Promise<{ change: string | null; history: string[] }>; undo(): Promise<string | null>; redo(): Promise<string | null>; build(mode: "changed" | "all"): Promise<SaveFiles> /* runs save() with a crypto.getRandomValues seed, then markSaved() */; originals(): Promise<SaveFiles>; itemCatalog(lang: string): Promise<{ id: number; name: string; kind: string; sprite: string }[]> }`
  - `handlers.ts` exports `createApi(fetcher): Api` (pure and testable in Bun). `worker.ts` adapts it to `postMessage` with `{ id, method, args }` / `{ id, ok, value | error }` and transfers `Uint8Array` buffers. `api.ts` is the main-thread client that returns the same `Api` interface.

- [ ] **Step 1: Write failing tests** against `createApi` (golden-gated): after `load`, `players.length ≥ 1` and `revisionLabel === "3.0.3"`. `edit({op:"wallet",player:0,value:777})` then `player(0).wallet === 777`, and `undo()` restores the original value. `build("changed")` after one wallet edit returns exactly `Villager0/personal.dat` and `Villager0/personalHeader.dat`, and a second `build("changed")` with no edits returns an empty map. `originals()` stays byte-identical to the loaded input after edits. `itemCatalog("en")` excludes `(None)` and empty names.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** the files. Vite config: Svelte plugin, `base: process.env.BASE_PATH ?? "/"`, `worker.format: "es"`.
- [ ] **Step 4: Run** `bun test` and `bun run build`. Expected: PASS, and the build emits a worker chunk.
- [ ] **Step 5: Commit**: `git commit -m "Add worker-backed save API"`.

---

### Task 10: App shell, load and save flows

**Files:**
- Create: `app/src/{main.ts,App.svelte,app.css}`, `app/src/lib/state.svelte.ts`, `app/src/components/{EmptyState,Sidebar,TopBar,SaveMenu,HashWarning,Toast}.svelte`

**Interfaces:**
- Consumes: `Api` (Task 9), the `io` functions (Task 8).
- Produces: `state.svelte.ts` exports `app = $state({ loaded: LoadResult | null; section: "player" | "villagers" | "map" | "collections" | "island"; playerIndex: number; history: string[]; advanced: boolean; folder: FileSystemDirectoryHandle | null; backedUp: boolean })` and the actions `openFolder()`, `openFiles(files)`, `saveInPlace()`, `saveZip()`, `undo()`, `redo()`.

Behaviour (from spec §6–7):
- **EmptyState**: an "Open save folder" button (`openFolder` when `supportsFsAccess()`, otherwise a hidden `<input webkitdirectory>`), an "Open .zip" input, and a full-page drop zone. The copy: "Your save never leaves this computer."
- **Load errors**: show `SaveLoadError.detail` (e.g. "Game version not supported yet (header revision 35)"). **HashWarning**: a dismissible banner listing invalid regions when `invalidHashes` is non-empty.
- **Sidebar**: one Players entry per resident (by name), Villagers, Map, Collections, Island. Unbuilt sections are disabled with a "coming soon" tag.
- **TopBar**: island name, revision badge, undo/redo buttons (disabled when not possible), a changes counter whose popover lists `history`, and the Save menu.
- **saveInPlace** (only when `folder` is set): if `!backedUp`, download `toZip(originals(), island)` as `backupName` and set `backedUp`. Then `writeFiles(folder, await api.build("changed"))`, then a toast "Saved N files". **saveZip**: `downloadBytes(toZip(await api.build("all"), island), saveZipName(...))`.
- Shortcuts: `Ctrl+Z`, `Ctrl+Shift+Z`/`Ctrl+Y`, `Ctrl+S` (in place if a folder is open, otherwise zip), `/` focuses the active search field. Theme: CSS custom properties with `prefers-color-scheme`.

- [ ] **Step 1: Implement** the components above.
- [ ] **Step 2: Verify manually** with `bun run dev` in Chromium (using the run skill / browser automation): load `example-save-file` via the folder picker, check that the sidebar shows the resident name and the badge `3.0.3`, then use Save as zip and confirm a zip downloads. Load the same folder through a drop and through a `.zip` and confirm identical results. In Firefox, check that "Save in place" is hidden. Run `bun run typecheck`. Expected: clean.
- [ ] **Step 3: Commit**: `git commit -m "Add app shell with load, backup, and save flows"`.

---

### Task 11: Player editor: profile and money

**Files:**
- Create: `app/src/sections/player/{PlayerSection,ProfileCard,MoneyCard,NumberField}.svelte`

**Interfaces:**
- Consumes: `api.player`, `api.edit` with the Task 7 ops, `app.advanced`.
- Produces: `NumberField` props `{ label; value: number; max: number; onCommit(v: number): void }` with commit on blur or Enter, an out-of-range state with an inline message, and a "Max" button.

Content:
- **ProfileCard**: player name (≤ 10 characters, live counter, commits `playerName`), town name (commits `townName`, labelled "affects all residents"), birthday month/day selects (day options depend on month; Feb allows 29), native fruit select (the 5 native fruit item ids, read from the upstream `MiscPlayerEditor` fruit list), and read-only Player ID / Town ID with the tooltip "Identity values link this player across files. Editing them can break the save."
- **MoneyCard**: wallet (max 99,999), bank (max 999,999,999), Nook Miles and total (max 4,294,967,295), hotel tickets (shown only when not null), and unlocked slot counts for pocket, bag and storage (max 20 / 20 / `slotCounts.itemChest`). With `advanced` on, every max becomes 4,294,967,295.

- [ ] **Step 1: Implement.** After every `edit`, re-fetch `player(i)` so the UI always shows the bytes as read back.
- [ ] **Step 2: Verify manually**: set wallet to 12,345 → the counter shows 1 change → undo restores it. Typing 100000 in the wallet field shows the range message and sends no edit. Renaming to a 12-character name is blocked at 10. Save as zip, reload that zip, and confirm the values persisted. `bun run typecheck` is clean.
- [ ] **Step 3: Commit**: `git commit -m "Add player profile and money editor"`.

---

### Task 12: Inventory grids and item picker

**Files:**
- Create: `app/src/sections/player/{InventoryCard,ItemGrid,ItemSlot,ItemPicker,ItemFields,SlotMenu}.svelte`, `app/src/lib/fuzzy.ts`, `tests/unit/fuzzy.test.ts`

**Interfaces:**
- Consumes: `PlayerView.pocket/bag/itemChest`, `api.itemCatalog`, `setItem`/`moveItem` ops, `remakeInfo`, `recipeItem`, and the `lang` remake names.
- Produces: `fuzzyFilter<T>(items: T[], query: string, key: (t: T) => string, limit = 200): T[]` (case- and diacritic-insensitive subsequence match, ranked by contiguous-run length then earliest index).

Content:
- **Grids**: pockets (slots 1–20) and bag (21–40) as 10-wide sprite grids. Storage is a virtualized grid (render only the visible rows) for `slotCounts.itemChest`. Locked slots beyond the unlocked count are shown dimmed but stay editable. Each slot shows its sprite, a count badge when `count > 0`, and its name in a tooltip.
- **Drag and drop** between any two slots (including across areas) sends `moveItem`. **SlotMenu** (right-click or long-press): Clear (`setItem` with raw `"000000000000fffe"`), Duplicate to the next empty slot, Fill row, Fill all empty. Multi-slot actions send one `batch` op (Task 7), so each is a single undo step.
- **ItemPicker** (a side panel opened by clicking a slot): search box (fuzzy), category chips with **Furniture** (`isFurniture`), **Clothing** (`isClothing`), **Crafting** (`isCrafting`), **DIY recipes** (`Kind_DIYRecipe`), **Tools** (`Kind_Axe, Kind_Shovel, Kind_Net, Kind_FishingRod, Kind_Slingshot, Kind_Watering, Kind_Ladder`), **Critters** (`Kind_Fish, Kind_DiveFish, Kind_Insect`), **Fossils** (`Kind_Fossil, Kind_FossilUnknown`), **Flowers & plants** (`Kind_Flower, Kind_FlowerSeed, Kind_FlowerBud, Kind_Fruit`), and a virtualized result list with sprites.
- **ItemFields**, shown for the selected item: count and use count (raw values, with the hint "Stacks show count + 1 in game"). Body variant and fabric pattern selects, labelled from `remakeBody`/`remakeFabric`, when `remakeInfo(id)` exists. A recipe select (all `recipes` entries named via `getItemNameById(recipeItem)`) for `Kind_DIYRecipe`, writing `freeParam`. A fossil select for `Kind_FossilUnknown`. An Apply button sends `setItem` with the composed raw value.

- [ ] **Step 1: Write failing tests** for `fuzzyFilter`: `"golden shov"` ranks "golden shovel" first among ["shovel", "golden shovel", "golden slingshot"]. `"cafe"` matches "café". An empty query returns the first `limit` items unchanged.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `fuzzy.ts` and the components. Sprite `<img>` elements use `loading="lazy"`.
- [ ] **Step 4: Run** `bun test`. Expected: PASS. **Verify manually**: put a Golden Shovel in pocket slot 3 via search; drag it to bag slot 25; Fill row with 99 of one material; undo three times returns the exact original grid. Scrolling storage stays smooth with 9,000 slots.
- [ ] **Step 5: Commit**: `git commit -m "Add inventory grids, drag-drop, and searchable item picker"`.

---

### Task 13: E2E, CI, and GitHub Pages

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/roundtrip.spec.ts`, `.github/workflows/ci.yml`, `.github/workflows/pages.yml`
- Modify: `README.md` (usage, Linux/Chromium vs Firefox save behaviour, a "back up your save" warning, a dev section covering `NHSE_TEST_SAVE`, the reference CLI and `gen:data`, and credits)

**Interfaces:**
- Consumes: the built app (`vite preview`).

- [ ] **Step 1: Write the E2E test** (skipped without `NHSE_TEST_SAVE`): zip the save with `toZip` into a temp file, open the app, `setInputFiles` on the zip input, set wallet to 4321, press Ctrl+S (zip mode, since no folder is open), capture the download, upload that zip again, and assert the wallet field reads 4,321 and the resident name is unchanged.
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=… bunx playwright test`. Expected: PASS.
- [ ] **Step 3: Write the workflows.** `ci.yml` runs on push and PR: checkout (no submodules needed), `oven-sh/setup-bun`, `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, `bun run build`. `pages.yml` runs on push to `main`: build with `BASE_PATH=/${{ github.event.repository.name }}/`, then `actions/upload-pages-artifact` and `actions/deploy-pages`.
- [ ] **Step 4: Verify** with `act`-free local checks: run `BASE_PATH=/nhse-web/ bun run build && bun run --cwd app preview`, then open `/nhse-web/` and confirm that assets, the worker, sprites and the language JSON all load (no 404s in the network panel).
- [ ] **Step 5: Commit**: `git commit -m "Add E2E round-trip test, CI, and GitHub Pages deploy"`.

---

### Task 14: Acceptance on the real game

- [ ] **Step 1:** In the app, edit the example save: wallet 12,345; a Golden Shovel in pocket slot 3; birthday 7/4. Save as zip.
- [ ] **Step 2:** Run the golden suite one final time (`NHSE_TEST_SAVE=… bun test`). Expected: all pass.
- [ ] **Step 3:** The user imports the edited save into the ACNH PC Recomp and confirms the edits appear in game with no corruption message. Record the result in the PR description. Sub-project 1 is done only after this confirmation.
