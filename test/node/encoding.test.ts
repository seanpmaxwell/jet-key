import { afterEach, describe, expect, it, vi } from 'vitest';

import { ALPHABET } from '@test/_common/constants';

afterEach(() => {
  vi.doUnmock('@src/api/_common/random');
  vi.resetModules();
});

describe('independent encoder checks', () => {
  it('maps 260 distinct random bits to 52 characters, five bits each', async () => {
    let bit = -1;
    vi.doMock('@src/api/_common/random', () => ({
      fillBufferWithRandomBytes(bytes: Uint8Array) {
        bytes.fill(0);
        if (bit >= 0) bytes[bit >>> 3] = 1 << (bit & 7);
      },
    }));
    const effects = new Array<number>(52).fill(0);
    let unused = 0;
    for (bit = 0; bit < 288; bit++) {
      vi.resetModules();
      const { default: generate } = await import('@src/index');
      const key = generate();
      const changed = [...key].flatMap((char, index) =>
        char === '0' ? [] : [index],
      );
      expect(changed.length, `input bit ${bit}`).toBeLessThanOrEqual(1);
      if (changed.length === 0) unused++;
      else effects[changed[0]]++;
    }
    expect(effects).toEqual(new Array(52).fill(5));
    expect(unused).toBe(28);
  });

  it('matches a scalar encoding oracle through overlapping chunks and draws', async () => {
    let state = 123;
    let expected = '';
    vi.doMock('@src/api/_common/random', () => ({
      fillBufferWithRandomBytes(bytes: Uint8Array) {
        const words = new Uint32Array(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength / 4,
        );
        for (let i = 0; i < words.length; i++) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          words[i] = state;
          // Encode independently with arithmetic, no packed character tables.
          const pairs = i % 9 === 8 ? 2 : 3;
          for (let pair = 0; pair < pairs; pair++) {
            const value = Math.floor(state / 2 ** (pair * 10)) % 1024;
            expected += ALPHABET[Math.floor(value / 32)] + ALPHABET[value % 32];
          }
        }
      },
    }));
    vi.resetModules();
    const { default: generate } = await import('@src/index');
    const sizes = [1, 128, 256, 261, 512, 300001, 1048576, 256];
    const actual = sizes.map((bits) => generate(bits)).join('');
    expect(actual).toBe(expected.slice(0, actual.length));
  });
});
