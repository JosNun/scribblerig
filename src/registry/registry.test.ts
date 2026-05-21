import { describe, it, expect } from "vitest";
import { bodyTypes, def, makeBody } from "./registry";

describe("registry", () => {
  it("offers ball, platform, and wheel as placeable body types", () => {
    expect(bodyTypes().map((d) => d.type)).toEqual(["ball", "platform", "wheel"]);
  });

  it("makeBody stamps a body at a position with the type's default props", () => {
    const ball = makeBody("ball", { x: 2, y: 3 });
    expect(ball.type).toBe("ball");
    expect(ball.position).toEqual({ x: 2, y: 3 });
    expect(ball.rotation).toBe(0);
    expect(ball.props).toEqual(def("ball").defaults);
    // defaults are copied, not shared
    expect(ball.props).not.toBe(def("ball").defaults);
  });

  it("declares collision/visual geometry as primitive shapes", () => {
    expect(def("ball").shapes(def("ball").defaults)).toEqual([
      { kind: "circle", radius: expect.any(Number) },
    ]);
    expect(def("platform").shapes(def("platform").defaults)).toEqual([
      { kind: "box", halfWidth: expect.any(Number), halfHeight: expect.any(Number) },
    ]);
  });

  it("gives the wheel render-only spoke marks; ball and platform have none", () => {
    expect(def("wheel").marks?.(def("wheel").defaults)?.length).toBeGreaterThan(0);
    expect(def("ball").marks).toBeUndefined();
    expect(def("platform").marks).toBeUndefined();
  });

  it("marks platforms static by default but balls and wheels dynamic", () => {
    expect(def("platform").isStatic(def("platform").defaults)).toBe(true);
    expect(def("ball").isStatic(def("ball").defaults)).toBe(false);
    expect(def("wheel").isStatic(def("wheel").defaults)).toBe(false);
  });
});
