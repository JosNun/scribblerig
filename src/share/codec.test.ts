import { describe, it, expect } from "vitest";
import { encodeScene, decodeScene, sanitizeScene } from "./codec";
import {
  createScene,
  addBody,
  addConnector,
  updateRoomSettings,
  type Scene,
} from "../scene/scene";
import { makeBody, makeConnector } from "../registry/registry";

/** A representative scene: tweaked room, a few bodies, and connectors. */
function sampleScene(): Scene {
  let s = createScene();
  s = updateRoomSettings(s, 0, {
    gravity: { x: 1, y: -5 },
    walls: { floor: true, ceiling: true, left: false, right: true },
    size: { width: 10, height: 8 },
    snap: true,
  });
  const ball = addBody(s, 0, makeBody("ball", { x: 2, y: 3 }));
  s = ball.scene;
  const platform = addBody(s, 0, makeBody("platform", { x: -1, y: 1 }));
  s = platform.scene;
  s = addConnector(
    s,
    0,
    makeConnector("motor", { body: ball.id, local: { x: 0, y: 0 } }, { world: { x: 2, y: 3 } }),
  ).scene;
  s = addConnector(
    s,
    0,
    makeConnector("spring", { body: ball.id, local: { x: 0, y: 0 } }, { body: platform.id, local: { x: 0, y: 0 } }),
  ).scene;
  return s;
}

describe("share codec", () => {
  it("round-trips a scene through encode → decode", () => {
    const s = sampleScene();
    expect(decodeScene(encodeScene(s))).toEqual(s);
  });

  it("returns null for malformed, truncated, or empty input", () => {
    expect(decodeScene("")).toBeNull();
    expect(decodeScene("not valid base64url !@#$%")).toBeNull();
    expect(decodeScene(encodeScene(sampleScene()).slice(0, 12))).toBeNull(); // truncated
  });

  // The tutorial scene is a build-time constant authored in-app and pasted
  // back as a Scene literal. If anyone edits the literal in a way the codec
  // can't round-trip (an unknown prop, a malformed endpoint), this test
  // catches it before a user runs into a busted Tutorial.
  it("round-trips the tutorial scene without drift", async () => {
    const { tutorialScene } = await import("./tutorialScene");
    expect(decodeScene(encodeScene(tutorialScene))).toEqual(tutorialScene);
  });
});

describe("sanitizeScene (tolerant import)", () => {
  it("rejects input that isn't a scene-shaped object", () => {
    expect(sanitizeScene(42)).toBeNull();
    expect(sanitizeScene(null)).toBeNull();
    expect(sanitizeScene("scene")).toBeNull();
    expect(sanitizeScene({})).toBeNull(); // no rooms
    expect(sanitizeScene({ rooms: [] })).toBeNull(); // empty rooms
  });

  it("drops bodies of an unknown type and keeps the rest", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            { id: "b1", type: "ball", position: { x: 0, y: 1 }, rotation: 0, props: {} },
            { id: "b2", type: "hovercraft", position: { x: 1, y: 1 }, rotation: 0, props: {} },
          ],
          connectors: [],
        },
      ],
    })!;
    expect(out.rooms[0].bodies.map((b) => b.id)).toEqual(["b1"]);
  });

  it("fills missing props with registry defaults, ignores unknown ones, and coerces bad types", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            {
              id: "b1",
              type: "ball",
              position: { x: 0, y: 1 },
              rotation: 0,
              // radius valid; restitution wrong type; friction/density missing; gloss unknown
              props: { radius: 0.9, restitution: "high", gloss: 7 },
            },
          ],
          connectors: [],
        },
      ],
    })!;
    expect(out.rooms[0].bodies[0].props).toEqual({
      radius: 0.9,
      friction: 0.5,
      restitution: 0.5,
      density: 1,
    });
  });

  it("drops connectors whose endpoint references a missing/dropped body", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [{ id: "b1", type: "ball", position: { x: 0, y: 1 }, rotation: 0, props: {} }],
          connectors: [
            // valid: b1 → a world point
            { id: "c1", type: "spring", a: { body: "b1", local: { x: 0, y: 0 } }, b: { world: { x: 3, y: 1 } }, props: {} },
            // dangling: references b9 which doesn't exist
            { id: "c2", type: "spring", a: { body: "b1", local: { x: 0, y: 0 } }, b: { body: "b9", local: { x: 0, y: 0 } }, props: {} },
          ],
        },
      ],
    })!;
    expect(out.rooms[0].connectors.map((c) => c.id)).toEqual(["c1"]);
  });

  it("advances nextId past every surviving id so later edits don't collide", () => {
    const out = sanitizeScene({
      nextId: 2, // stale/too low
      rooms: [
        {
          bodies: [{ id: "b7", type: "ball", position: { x: 0, y: 1 }, rotation: 0, props: {} }],
          connectors: [{ id: "c4", type: "weld", a: { body: "b7", local: { x: 0, y: 0 } }, b: { world: { x: 1, y: 1 } }, props: {} }],
        },
      ],
    })!;
    expect(out.nextId).toBe(8); // max(2, 7+1, 4+1)
  });
});

// The scene's optional `title` field — naming a build for OpenGraph previews
// and shortlinks (issue og-share/01). The codec is the gate that enforces
// sanitisation, since both shared URLs and autosaves flow through it.
// Spawner templates are a nested mini-scene that ride inside a spawner's
// `template` field (issue 19). The sanitizer must recurse once: nested
// spawners are stripped (no nesting), connectors must resolve inside the
// template (no cross-scope refs), nextId must walk into templates so future
// mints don't collide with nested ids.
describe("sanitizeScene (spawner templates)", () => {
  it("keeps a well-formed template and round-trips it through encode/decode", () => {
    let s = createScene();
    const sp = addBody(s, 0, {
      type: "spawner",
      position: { x: 1, y: 2 },
      rotation: 0,
      props: { interval: 0.5, maxAlive: 20, speed: 3, static: false },
      template: {
        bodies: [
          { id: "b50", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: { radius: 0.3 } },
        ],
        connectors: [],
      },
    });
    s = sp.scene;

    const round = decodeScene(encodeScene(s))!;
    const spawner = round.rooms[0].bodies.find((b) => b.id === sp.id)!;
    expect(spawner.template?.bodies.map((b) => b.id)).toEqual(["b50"]);
  });

  it("strips a spawner nested inside another spawner's template", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            {
              id: "b1",
              type: "spawner",
              position: { x: 0, y: 1 },
              rotation: 0,
              props: {},
              template: {
                bodies: [
                  { id: "b2", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} },
                  // nested spawner — must be stripped (no recursion allowed)
                  { id: "b3", type: "spawner", position: { x: 1, y: 0 }, rotation: 0, props: {} },
                ],
                connectors: [],
              },
            },
          ],
          connectors: [],
        },
      ],
    })!;

    const spawner = out.rooms[0].bodies[0];
    expect(spawner.template?.bodies.map((b) => b.id)).toEqual(["b2"]);
  });

  it("drops template connectors that reference bodies outside the template", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            {
              id: "b1",
              type: "spawner",
              position: { x: 0, y: 1 },
              rotation: 0,
              props: {},
              template: {
                bodies: [
                  { id: "b2", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} },
                ],
                connectors: [
                  // valid: b2 → world point
                  { id: "c10", type: "spring", a: { body: "b2", local: { x: 0, y: 0 } }, b: { world: { x: 1, y: 1 } }, props: {} },
                  // cross-scope: b99 isn't in the template (it's not even in the scene)
                  { id: "c11", type: "spring", a: { body: "b2", local: { x: 0, y: 0 } }, b: { body: "b99", local: { x: 0, y: 0 } }, props: {} },
                ],
              },
            },
          ],
          connectors: [],
        },
      ],
    })!;

    const tmpl = out.rooms[0].bodies[0].template!;
    expect(tmpl.connectors.map((c) => c.id)).toEqual(["c10"]);
  });

  it("an old scene without the spawner type drops the spawner gracefully", () => {
    // Simulate a payload that came back from a future client (or got hand-
    // rolled) where `spawner` is unknown. Real ScribbleRig versions before
    // issue 19 simply didn't know `spawner` — the registry-based filter must
    // still let the rest of the room through.
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            { id: "b1", type: "ball", position: { x: 0, y: 1 }, rotation: 0, props: {} },
            { id: "b2", type: "future-doohickey", position: { x: 0, y: 0 }, rotation: 0, props: {} },
          ],
          connectors: [],
        },
      ],
    })!;
    expect(out.rooms[0].bodies.map((b) => b.id)).toEqual(["b1"]);
  });

  it("advances nextId past ids nested inside a template", () => {
    const out = sanitizeScene({
      nextId: 2,
      rooms: [
        {
          bodies: [
            {
              id: "b3",
              type: "spawner",
              position: { x: 0, y: 1 },
              rotation: 0,
              props: {},
              template: {
                bodies: [
                  { id: "b50", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} },
                ],
                connectors: [
                  { id: "c77", type: "spring", a: { body: "b50", local: { x: 0, y: 0 } }, b: { world: { x: 0, y: 0 } }, props: {} },
                ],
              },
            },
          ],
          connectors: [],
        },
      ],
    })!;
    expect(out.nextId).toBe(78); // max(2, 3+1, 50+1, 77+1)
  });
});

// Text bodies (PRD: text-object) — a non-colliding body type for labels and
// notes. The codec needs to preserve their `text` string prop through
// round-trip (the existing sanitizeProps only handled number/boolean) and
// strip text bodies from spawner templates the same way it strips nested
// spawners (the UI bans both at drop time).
describe("sanitizeScene (text bodies)", () => {
  it("round-trips a text body's multiline label through encode/decode", () => {
    let s = createScene();
    const t = addBody(s, 0, {
      type: "text",
      position: { x: 1, y: 2 },
      rotation: 0,
      props: { text: "first line\nsecond line", size: 0.6, static: true },
    });
    s = t.scene;
    expect(decodeScene(encodeScene(s))).toEqual(s);
  });

  it("caps a string prop at the per-prop length budget", () => {
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            {
              id: "b1",
              type: "text",
              position: { x: 0, y: 0 },
              rotation: 0,
              props: { text: "x".repeat(5000), size: 0.4 },
            },
          ],
          connectors: [],
        },
      ],
    })!;
    // 2000-char cap from the codec; longer payloads can't be smuggled in.
    expect((out.rooms[0].bodies[0].props.text as string).length).toBe(2000);
  });

  it("strips a text body nested inside a spawner's template", () => {
    // Mirrors the nested-spawner ban: the UI prevents the drop, the codec
    // strips it on import so an old/hand-crafted payload can't get in either.
    const out = sanitizeScene({
      rooms: [
        {
          bodies: [
            {
              id: "b1",
              type: "spawner",
              position: { x: 0, y: 1 },
              rotation: 0,
              props: {},
              template: {
                bodies: [
                  { id: "b2", type: "ball", position: { x: 0, y: 0 }, rotation: 0, props: {} },
                  { id: "b3", type: "text", position: { x: 0, y: 0 }, rotation: 0, props: { text: "Note", size: 0.4 } },
                ],
                connectors: [],
              },
            },
          ],
          connectors: [],
        },
      ],
    })!;
    expect(out.rooms[0].bodies[0].template?.bodies.map((b) => b.id)).toEqual(["b2"]);
  });
});

describe("scene.title", () => {
  it("round-trips a title through encode → decode", () => {
    const s: Scene = { ...sampleScene(), title: "My rolling-ball machine" };
    expect(decodeScene(encodeScene(s))).toEqual(s);
  });

  it("caps the title at 80 characters", () => {
    const s: Scene = { ...sampleScene(), title: "x".repeat(200) };
    expect(decodeScene(encodeScene(s))?.title).toHaveLength(80);
  });

  it("strips ASCII control characters from titles", () => {
    const s: Scene = { ...sampleScene(), title: "Hello\x00\x07\x1f\x7fWorld" };
    expect(decodeScene(encodeScene(s))?.title).toBe("HelloWorld");
  });

  it("strips angle brackets to defuse HTML injection at the source", () => {
    // Belt-and-suspenders alongside HTMLRewriter's default attribute escaping.
    const s: Scene = { ...sampleScene(), title: "<script>alert(1)</script>" };
    expect(decodeScene(encodeScene(s))?.title).toBe("scriptalert(1)/script");
  });

  it("a scene without a title sanitises with no title field present", () => {
    const out = decodeScene(encodeScene(sampleScene()));
    expect(out).not.toHaveProperty("title");
  });

  it("drops non-string titles (number, boolean, object)", () => {
    expect(sanitizeScene({ ...sampleScene(), title: 42 })).not.toHaveProperty("title");
    expect(sanitizeScene({ ...sampleScene(), title: true })).not.toHaveProperty("title");
    expect(sanitizeScene({ ...sampleScene(), title: { nested: "obj" } })).not.toHaveProperty("title");
  });

  it("drops whitespace-only titles", () => {
    const s = { ...sampleScene(), title: "   \t  " };
    expect(sanitizeScene(s)).not.toHaveProperty("title");
  });
});
