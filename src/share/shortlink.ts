/**
 * Client helper for the worker's `POST /api/share` endpoint
 * (og-share issue 02). Posts an already-encoded scene + optional title,
 * returns the minted absolute shortlink URL.
 *
 * Used by the Share popover (issue 03) when the user has named their
 * build OR when an un-named encoded URL would exceed
 * {@link AUTO_PROMOTE_THRESHOLD}.
 *
 * Errors are surfaced as rejected promises so the caller can show a
 * friendly message and fall back to the `?s=` URL if needed.
 */

/**
 * Encoded-URL length above which we auto-promote an un-named share to a
 * shortlink. Conservative — well under crawler / chat-app limits, with
 * headroom for the hostname + path before `?s=`.
 */
export const AUTO_PROMOTE_THRESHOLD = 1500;

/**
 * Decide which URL form to use for a share. Pure: takes the encoded
 * scene length and whether the user supplied a title, returns the
 * branch the popover should take.
 */
export function shouldMintShortlink(opts: {
  encodedLength: number;
  hasTitle: boolean;
}): boolean {
  return opts.hasTitle || opts.encodedLength > AUTO_PROMOTE_THRESHOLD;
}

export interface MintResponse {
  id: string;
  url: string;
}

/**
 * POST the encoded scene + title to the worker's mint endpoint. Rejects
 * with a descriptive `Error` on non-2xx responses so the caller can
 * decide between user messaging and silent fallback.
 */
export async function mintShortlink(
  sceneEnc: string,
  title?: string,
): Promise<MintResponse> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sceneEnc, ...(title ? { title } : {}) }),
  });
  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    throw new Error(`mint failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as MintResponse;
  if (typeof body.id !== "string" || typeof body.url !== "string") {
    throw new Error("mint returned malformed response");
  }
  return body;
}
