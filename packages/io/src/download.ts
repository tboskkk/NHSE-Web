const pad = (n: number) => String(n).padStart(2, "0");
const clean = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").trim() || "Island";
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const backupName = (island: string, date: Date) =>
  `${clean(island)}_backup_${day(date)}_${pad(date.getHours())}-${pad(date.getMinutes())}.zip`;
export const saveZipName = (island: string, date: Date) => `${clean(island)}_${day(date)}.zip`;

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
