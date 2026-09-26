// ========================================================================= //
//                                   INIT                                    //
// ========================================================================= //

// ---- Platform check
// The pools write 32-bit words and read them back as bytes, which only
// lines up on a little-endian machine.
if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
  throw new Error('jet-key requires a little-endian platform.');
}

// ---- `fillBufferWithRandomBytes`
// The annotation is deliberate: `nodeCrypto` is `any`, so without it the
// inferred type is `any` too and every call site loses its check.
export const fillBufferWithRandomBytes: (buffer: Uint8Array) => unknown =
  (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const process = (globalThis as any).process;
    const nodeCrypto = process?.getBuiltinModule?.('node:crypto');
    const webCrypto = globalThis.crypto;
    if (typeof nodeCrypto?.randomFillSync === 'function') {
      return nodeCrypto.randomFillSync;
    } else if (typeof webCrypto?.getRandomValues === 'function') {
      return webCrypto.getRandomValues.bind(webCrypto);
    }
    return () => {
      throw new Error(
        'jet-key requires crypto.getRandomValues or node:crypto.randomFillSync.',
      );
    };
  })();
