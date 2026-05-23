import { describe, expect, it } from "vitest";
import {
  AUTO_PROMOTE_THRESHOLD,
  shouldMintShortlink,
} from "./shortlink";

describe("shouldMintShortlink", () => {
  it("returns true when the user named the build", () => {
    expect(shouldMintShortlink({ encodedLength: 50, hasTitle: true })).toBe(true);
  });

  it("returns false for un-named scenes under the size threshold", () => {
    expect(shouldMintShortlink({ encodedLength: 1000, hasTitle: false })).toBe(false);
  });

  it("auto-promotes an un-named scene over the threshold", () => {
    expect(
      shouldMintShortlink({
        encodedLength: AUTO_PROMOTE_THRESHOLD + 1,
        hasTitle: false,
      }),
    ).toBe(true);
  });

  it("treats the threshold itself as still-not-promoted", () => {
    // Strictly greater-than: a scene exactly at the threshold stays as ?s=.
    expect(
      shouldMintShortlink({
        encodedLength: AUTO_PROMOTE_THRESHOLD,
        hasTitle: false,
      }),
    ).toBe(false);
  });
});
