export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

export class SeededRandom {
  private value: number;

  constructor(seed: number) {
    this.value = seed >>> 0 || 0x6d2b79f5;
  }

  get state(): number {
    return this.value >>> 0;
  }

  set state(next: number) {
    this.value = next >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    let value = this.value;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.value = value >>> 0;
    return this.value / 4294967296;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  integer(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[Math.floor(this.next() * values.length)] as T;
  }

  weighted<T>(values: readonly T[], weight: (value: T) => number): T {
    const weights = values.map((value) => Math.max(0.0001, weight(value)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = this.next() * total;
    for (let index = 0; index < values.length; index += 1) {
      cursor -= weights[index] as number;
      if (cursor <= 0) return values[index] as T;
    }
    return values[values.length - 1] as T;
  }
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalizedDifference(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  if (average <= 0) return 0;
  let total = 0;
  for (const left of values) {
    for (const right of values) total += Math.abs(left - right);
  }
  return clamp(total / (2 * values.length * values.length * average));
}
