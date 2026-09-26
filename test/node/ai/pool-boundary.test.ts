import { describe, expect, it, vi } from 'vitest';

import { KEY_LENGTH, KEY_PATTERN } from '@test/_common/constants';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

// A chunk is one pool string, and one CSPRNG draw fills CHUNKS of them, so
// keys are handed out across two nested boundaries.
const CHUNK_KEYS = 256;
const CHUNKS = 4;
const DRAW_KEYS = CHUNK_KEYS * CHUNKS; // 1024

// Counts that land on, just before and just after each boundary.
const COUNTS = [
  CHUNK_KEYS - 1,
  CHUNK_KEYS,
  CHUNK_KEYS + 1,
  2 * CHUNK_KEYS,
  DRAW_KEYS - 1,
  DRAW_KEYS,
  DRAW_KEYS + 1,
  2 * DRAW_KEYS,
] as const;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * A generator with a fresh module state, so each case starts at offset 0 of
 * an unused pool rather than wherever the previous case left off.
 */
async function freshJetKey(): Promise<typeof import('@src/index').default> {
  vi.resetModules();
  const mod = await import('@src/index');
  return mod.default;
}

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

describe('pool boundary', () => {
  it.each(COUNTS)('generates exactly %i unique, valid keys', async (count) => {
    const jetKey = await freshJetKey();

    const keys = new Set<string>();
    for (let i = 0; i < count; i++) {
      keys.add(jetKey());
    }

    expect(keys.size).toBe(count);
    for (const key of keys) {
      expect(key).toHaveLength(KEY_LENGTH);
      expect(key).toMatch(KEY_PATTERN);
    }
  });

  it('hands out contiguous keys across a chunk refill', async () => {
    const jetKey = await freshJetKey();

    // Drain to one key short of the boundary, then straddle it.
    for (let i = 0; i < CHUNK_KEYS - 1; i++) {
      jetKey();
    }
    const before = jetKey(); // last of chunk 0
    const after = jetKey(); // first of chunk 1

    expect(before).toMatch(KEY_PATTERN);
    expect(after).toMatch(KEY_PATTERN);
    expect(before).not.toBe(after);
  });

  it('stays unique across many consecutive draws', async () => {
    const jetKey = await freshJetKey();

    const total = 4 * DRAW_KEYS;
    const keys = new Set<string>();
    for (let i = 0; i < total; i++) {
      keys.add(jetKey());
    }
    expect(keys.size).toBe(total);
  });
});
