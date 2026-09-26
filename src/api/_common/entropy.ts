export const DEFAULT_ENTROPY = 256;
// At most 209,716 output characters per key.
export const MAX_ENTROPY = 1_048_576;

/** Convert the requested random bits to whole Crockford base32 characters. */
export function entropyToLength(entropy: number): number {
  if (!Number.isSafeInteger(entropy) || entropy < 1) {
    throw new RangeError('Entropy must be a positive safe integer in bits.');
  }
  if (entropy > MAX_ENTROPY) {
    throw new RangeError(`Entropy must not exceed ${MAX_ENTROPY} bits.`);
  }
  return Math.ceil(entropy / 5);
}
