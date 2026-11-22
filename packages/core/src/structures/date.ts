/** GSaveDateMD: month and day, two bytes. */
export type DateMD = { month: number; day: number };

export function readDateMD(d: Uint8Array, o: number): DateMD {
  return { month: d[o]!, day: d[o + 1]! };
}

export function writeDateMD(d: Uint8Array, o: number, v: DateMD): void {
  d[o] = v.month;
  d[o + 1] = v.day;
}
