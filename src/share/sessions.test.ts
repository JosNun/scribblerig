import { describe, it, expect } from "vitest";
import { deriveTitle, upsertSession, sortByRecent, removeSession, mostRecent } from "./sessions";
import { createScene, addBody } from "../scene/scene";
import { makeBody } from "../registry/registry";

describe("deriveTitle", () => {
  it("describes an empty build", () => {
    expect(deriveTitle(createScene())).toBe("Empty build");
  });

  it("counts bodies and connectors, pluralizing", () => {
    const one = addBody(createScene(), 0, makeBody("ball", { x: 0, y: 1 })).scene;
    expect(deriveTitle(one)).toBe("1 object");
    const two = addBody(one, 0, makeBody("ball", { x: 1, y: 1 })).scene;
    expect(deriveTitle(two)).toBe("2 objects");
  });
});

describe("session index", () => {
  const meta = (id: string, updatedAt: number) => ({ id, title: id, updatedAt });

  it("upsert puts a new session first and replaces an existing one in place", () => {
    const idx = [meta("a", 1), meta("b", 2)];
    expect(upsertSession(idx, meta("c", 3)).map((s) => s.id)).toEqual(["c", "a", "b"]);
    const replaced = upsertSession(idx, { id: "a", title: "a2", updatedAt: 9 });
    expect(replaced.map((s) => s.id)).toEqual(["a", "b"]);
    expect(replaced.find((s) => s.id === "a")).toMatchObject({ title: "a2", updatedAt: 9 });
  });

  it("sorts by most-recently updated and exposes the most recent", () => {
    const idx = [meta("a", 1), meta("c", 3), meta("b", 2)];
    expect(sortByRecent(idx).map((s) => s.id)).toEqual(["c", "b", "a"]);
    expect(mostRecent(idx)?.id).toBe("c");
    expect(mostRecent([])).toBeNull();
  });

  it("removes a session by id", () => {
    expect(removeSession([meta("a", 1), meta("b", 2)], "a").map((s) => s.id)).toEqual(["b"]);
  });
});
