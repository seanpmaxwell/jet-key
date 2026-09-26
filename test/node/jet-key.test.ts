import { describe, expect, it, vi } from 'vitest';

import jetKey, * as api from '@src/index';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const KEY_PATTERN = /^[0-9A-HJKMNP-TV-Z]{52}$/;
const KEY_LENGTH = 52;

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

// ---- `jetKey`
describe('jetKey()', () => {
  it('returns a string of 52 characters', () => {
    const key = jetKey();
    expect(typeof key).toBe('string');
    expect(key).toHaveLength(KEY_LENGTH);
  });

  it('only uses Crockford base32 characters, with no dashes', () => {
    for (let i = 0; i < 1_000; i++) {
      const key = jetKey();
      expect(key).toMatch(KEY_PATTERN);
    }
  });

  it('exposes only the default generator', () => {
    expect(Object.keys(api)).toEqual(['default']);
  });

  it('generates unique keys across multiple pool refills', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      keys.add(jetKey());
    }
    expect(keys.size).toBe(10_000);
  });
});

describe('requested entropy', () => {
  it.each([
    [1, 1],
    [5, 1],
    [6, 2],
    [128, 26],
    [255, 51],
    [256, 52],
    [260, 52],
    [261, 53],
    [512, 103],
    [66560, 13312],
    [300001, 60001],
    [1_048_576, 209716],
  ])('generates %i bits as %i characters', (bits, length) => {
    const key = jetKey(bits);
    expect(key).toHaveLength(length);
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    1_048_577,
    Number.MAX_SAFE_INTEGER,
    null,
    '256',
    true,
    {},
    [],
  ])('rejects invalid entropy %j', (entropy) => {
    expect(() => jetKey(entropy as number)).toThrow(RangeError);
  });

  it('accepts explicit undefined as the default', () => {
    expect(jetKey(undefined)).toHaveLength(52);
  });

  it('consumes the random stream exactly once across mixed sizes and refills', async () => {
    let state = 1;
    vi.doMock('@src/api/_common/random', () => ({
      fillBufferWithRandomBytes(bytes: Uint8Array) {
        for (let i = 0; i < bytes.length; i++) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          bytes[i] = state >>> 24;
        }
      },
    }));
    try {
      const lengths = [1, 26, 52, 53, 13311, 13312, 13313, 53249, 103, 52];
      const total = lengths.reduce((sum, length) => sum + length, 0);
      vi.resetModules();
      const { default: fixed } = await import('@src/index');
      const expected = Array.from({ length: Math.ceil(total / 52) }, () =>
        fixed(),
      )
        .join('')
        .slice(0, total);

      state = 1;
      vi.resetModules();
      const { default: variable } = await import('@src/index');
      const keys = lengths.map((length) => variable(length * 5));
      expect(keys.map((key) => key.length)).toEqual(lengths);
      expect(keys.join('')).toBe(expected);
    } finally {
      vi.doUnmock('@src/api/_common/random');
      vi.resetModules();
    }
  });
});
