export type SaveLoadErrorCode = "missing-main" | "unknown-revision" | "size-mismatch" | "missing-player-file";

/** Thrown when a save cannot be loaded; `detail` is user-presentable. */
export class SaveLoadError extends Error {
  constructor(
    readonly code: SaveLoadErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "SaveLoadError";
  }
}
