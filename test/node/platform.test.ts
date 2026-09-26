import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPoolDecoder } from '@src/api/_common/pool';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('@src/api/_common/random');
  vi.resetModules();
});

describe('platform fallbacks', () => {
  it('uses Buffer.toString when latin1Slice is unavailable', () => {
    const toString = vi.fn((encoding: BufferEncoding) => {
      expect(encoding).toBe('latin1');
      return 'ABC';
    });
    const from = vi.fn(() => ({ toString }));
    vi.stubGlobal('Buffer', { from });
    const bytes = new Uint8Array([0, 65, 66, 67, 0]).subarray(1, 4);
    expect(createPoolDecoder(bytes)()).toBe('ABC');
    expect(from).toHaveBeenCalledWith(bytes.buffer, 1, 3);
    expect(toString).toHaveBeenCalledOnce();
  });

  it('falls back to default TextDecoder when latin1 is unsupported', () => {
    const labels: (string | undefined)[] = [];
    const NativeDecoder = globalThis.TextDecoder;
    vi.stubGlobal('Buffer', undefined);
    vi.stubGlobal(
      'TextDecoder',
      class {
        constructor(label?: string) {
          labels.push(label);
          if (label === 'latin1') throw new RangeError('Unsupported encoding');
        }
        decode(bytes: Uint8Array) {
          return new NativeDecoder().decode(bytes);
        }
      },
    );
    expect(createPoolDecoder(new Uint8Array([65, 66, 67]))()).toBe('ABC');
    expect(labels).toEqual(['latin1', undefined]);
  });

  it('fails closed if no secure random source exists', async () => {
    vi.spyOn(process, 'getBuiltinModule').mockReturnValue(undefined);
    vi.stubGlobal('crypto', undefined);
    vi.resetModules();
    const { fillBufferWithRandomBytes } =
      await import('@src/api/_common/random');
    expect(() => fillBufferWithRandomBytes(new Uint8Array(1))).toThrow(
      'requires crypto',
    );
  });

  it('binds Web Crypto to its receiver', async () => {
    const crypto = {
      getRandomValues(bytes: Uint8Array) {
        expect(this).toBe(crypto);
        bytes.fill(42);
        return bytes;
      },
    };
    vi.spyOn(process, 'getBuiltinModule').mockReturnValue(undefined);
    vi.stubGlobal('crypto', crypto);
    vi.resetModules();
    const { fillBufferWithRandomBytes } =
      await import('@src/api/_common/random');
    const bytes = new Uint8Array(3);
    fillBufferWithRandomBytes(bytes);
    expect([...bytes]).toEqual([42, 42, 42]);
  });
});

it('recovers from a partial refill failure without replaying returned keys', async () => {
  let draw = 0;
  vi.doMock('@src/api/_common/random', () => ({
    fillBufferWithRandomBytes(bytes: Uint8Array) {
      draw++;
      bytes.fill(draw);
      if (draw === 2) throw new Error('Random source failed');
    },
  }));
  vi.resetModules();
  const { default: generate } = await import('@src/index');
  // Leave 26 characters from the last chunk of the first draw unused.
  const returned = generate((52 * 1024 - 26) * 5);
  expect(() => generate()).toThrow('Random source failed');
  const recovered = generate();
  expect(recovered).toHaveLength(52);
  expect(returned).not.toContain(recovered);
  expect(draw).toBe(3);
  expect(generate()).toHaveLength(52);
});
