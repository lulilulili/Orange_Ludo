export interface RandomSource {
  /** Returns a value in the half-open range [0, 1). */
  next(): number;
}

/** Small deterministic generator suitable for replayable game simulations. */
export class Mulberry32Random implements RandomSource {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new Error("Random seed must be a whole number.");
    }
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}

export function rollSixSided(random: RandomSource): number {
  const value = random.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`Random source returned an invalid value: ${value}`);
  }
  return Math.floor(value * 6) + 1;
}

export function chooseIndex(random: RandomSource, length: number): number {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("Cannot choose from an empty collection.");
  }
  const value = random.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`Random source returned an invalid value: ${value}`);
  }
  return Math.floor(value * length);
}
