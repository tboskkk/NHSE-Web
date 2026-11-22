const MERSENNE = 0x6c078965;

/** Port of NHSE.Core XorShift128 (all arithmetic is u32). */
export class XorShift128 {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = (Math.imul(MERSENNE, (seed ^ (seed >>> 30)) >>> 0) + 1) >>> 0;
    this.b = (Math.imul(MERSENNE, (this.a ^ (this.a >>> 30)) >>> 0) + 2) >>> 0;
    this.c = (Math.imul(MERSENNE, (this.b ^ (this.b >>> 30)) >>> 0) + 3) >>> 0;
    this.d = (Math.imul(MERSENNE, (this.c ^ (this.c >>> 30)) >>> 0) + 4) >>> 0;
  }

  next(): number {
    let t = this.a;
    this.a = this.b;
    this.b = this.c;
    this.c = this.d;
    t = (t ^ (t << 11)) >>> 0;
    t = (t ^ (t >>> 8)) >>> 0;
    this.d = (t ^ this.d ^ (this.d >>> 19)) >>> 0;
    return this.d;
  }

  next64(): bigint {
    const hi = this.next();
    const lo = this.next();
    return (BigInt(hi) << 32n) | BigInt(lo);
  }
}
