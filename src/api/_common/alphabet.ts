// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// ========================================================================= //
//                                   INIT                                    //
// ========================================================================= //

// ---- Double Codes
// Two character codes packed little-endian into 16 bits, indexed by a
// 10-bit value, so a pool writer can emit two characters per lookup.
const doubleCodesInit = new Uint16Array(1024);
for (let i = 0; i < doubleCodesInit.length; i++) {
  doubleCodesInit[i] =
    ALPHABET.charCodeAt(i >>> 5) | (ALPHABET.charCodeAt(i & 31) << 8);
}
export const DOUBLE_CODES = doubleCodesInit;
