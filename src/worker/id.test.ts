import { describe, expect, it } from "vitest";
import { nextShortlinkId, SHORTLINK_ID_LENGTH } from "./id";

describe("nextShortlinkId", () => {
  it("returns a 10-character string by default", () => {
    expect(nextShortlinkId()).toHaveLength(SHORTLINK_ID_LENGTH);
    expect(SHORTLINK_ID_LENGTH).toBe(10);
  });

  it("returns the requested length when overridden", () => {
    expect(nextShortlinkId(4)).toHaveLength(4);
    expect(nextShortlinkId(20)).toHaveLength(20);
  });

  it("uses only base62 characters", () => {
    const id = nextShortlinkId(200);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("produces different IDs on repeated calls", () => {
    // ~10^17 ID space; collisions in a 100-call sample would be a serious
    // failure of randomness, not a flaky test.
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(nextShortlinkId());
    expect(ids.size).toBe(100);
  });
});
