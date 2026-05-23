/// <reference types="@cloudflare/workers-types" />

/**
 * Generate opaque short IDs for shortlinks (og-share issue 02).
 *
 * 10 characters of base62 (`A-Za-z0-9`) give ≈8.4 × 10^17 distinct IDs,
 * which removes any practical need for collision detection during minting.
 * Uses Web Crypto's `getRandomValues` — available in Cloudflare Workers,
 * Node ≥ 19, and modern browsers — so this module needs no DOM and no
 * Node-specific imports.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const SHORTLINK_ID_LENGTH = 10;

/**
 * Returns a fresh `SHORTLINK_ID_LENGTH`-character base62 string. The
 * randomness comes from `crypto.getRandomValues` directly; rejection
 * sampling avoids modulo bias against the 62-char alphabet (256 % 62 ≠ 0,
 * so a naïve `byte % 62` would skew the first 4 letters slightly).
 */
export function nextShortlinkId(length: number = SHORTLINK_ID_LENGTH): string {
  const out: string[] = [];
  // Rejection-sample bytes 0..247 (248 is the largest multiple of 62 under
  // 256); the remaining 8 values are re-rolled, costing on average ~3 %
  // extra random reads.
  const limit = 256 - (256 % ALPHABET.length); // 248
  const buf = new Uint8Array(length * 2); // double-buffer to absorb rejects
  let bufPos = buf.length;
  const refill = () => {
    crypto.getRandomValues(buf);
    bufPos = 0;
  };
  refill();
  while (out.length < length) {
    if (bufPos >= buf.length) refill();
    const byte = buf[bufPos++];
    if (byte < limit) {
      out.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return out.join("");
}
