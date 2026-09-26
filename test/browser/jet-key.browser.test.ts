import { describe, expect, it } from 'vitest';

import jetKey from '@src/index';

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

// ---- Environment
describe('browser environment', () => {
  it('runs in a real browser', () => {
    // Reached through `globalThis` so the project doesn't need the DOM lib
    // just for this assertion.
    const browser = globalThis as typeof globalThis & {
      window?: unknown;
      document?: unknown;
    };
    expect(typeof browser.window).toBe('object');
    expect(typeof browser.document).toBe('object');
  });

  it('has no Buffer, so the TextDecoder decode path is used', () => {
    expect(typeof Buffer).toBe('undefined');
  });

  it('uses Web Crypto for randomness', () => {
    expect(typeof globalThis.crypto.getRandomValues).toBe('function');
  });
});

describe('jetKey() in the browser', () => {
  it('returns a 52-character Crockford base32 key without separators', () => {
    expect(jetKey()).toMatch(/^[0-9A-HJKMNP-TV-Z]{52}$/);
  });

  it('generates valid unique keys across multiple pool refills', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const key = jetKey();
      expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{52}$/);
      keys.add(key);
    }
    expect(keys.size).toBe(10_000);
  });
});

describe('entropy in the browser', () => {
  it.each([
    [128, 26],
    [256, 52],
    [512, 103],
    [300001, 60001],
  ])(
    'generates %i bits as %i characters across pool boundaries',
    (bits, length) => {
      const key = jetKey(bits);
      expect(key).toHaveLength(length);
      expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    },
  );
});
