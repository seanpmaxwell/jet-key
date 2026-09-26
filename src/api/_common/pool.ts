// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Returns a function that decodes a pool's character area into a string.
 *
 * The characters are all ASCII, so every path below yields identical text.
 * Buffer's `latin1Slice` is fastest when present, then `toString('latin1')`;
 * without Buffer at all, fall back to TextDecoder.
 */
export function createPoolDecoder(chunkBytes: Uint8Array): () => string {
  const { buffer, byteOffset, length } = chunkBytes;
  if (typeof Buffer !== 'undefined') {
    const view = Buffer.from(buffer, byteOffset, length) as Buffer & {
      latin1Slice?: (start: number, end: number) => string;
    };
    return typeof view.latin1Slice === 'function'
      ? () => view.latin1Slice!(0, length)
      : () => view.toString('latin1');
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder('latin1');
  } catch {
    // Not every runtime registers the latin1 label. The pool is pure
    // ASCII, so UTF-8 decodes to an identical string.
    decoder = new TextDecoder();
  }
  return () => decoder.decode(chunkBytes);
}

/**
 * Runs `callback` when a Node startup snapshot that captured this module is
 * restored. A snapshot can save a pool with unused keys still waiting in it;
 * without a reset, every process restored from that snapshot would hand out
 * the same saved batch. Does nothing outside Node, or outside a snapshot
 * build.
 */
export function onSnapshotRestore(callback: () => void): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v8 = (globalThis as any).process?.getBuiltinModule?.('node:v8');
  if (v8?.startupSnapshot?.isBuildingSnapshot()) {
    v8.startupSnapshot.addDeserializeCallback(callback);
  }
}
