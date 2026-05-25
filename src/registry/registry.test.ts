import { describe, it, expect } from "vitest";
import {
  bodyTypes,
  def,
  makeBody,
  connectorTypes,
  connectorDef,
  makeConnector,
  type BodyTypeDef,
} from "./registry";

describe("registry", () => {
  it("offers ball, platform, and spawner as placeable body types", () => {
    expect(bodyTypes().map((d) => d.type)).toEqual(["ball", "platform", "spawner"]);
  });

  it("declares a small fixed-size box glyph and the four spawner props", () => {
    const spawner = def("spawner");
    expect(spawner.shapes(spawner.defaults)).toEqual([
      { kind: "box", halfWidth: 0.25, halfHeight: 0.25 },
    ]);
    expect(spawner.propSchema.map((f) => f.key)).toEqual([
      "interval",
      "maxAlive",
      "speed",
      "static",
    ]);
    expect(spawner.defaults).toEqual({
      interval: 1.0,
      maxAlive: 10,
      speed: 0,
      static: false,
    });
    // Dynamic by default (so it can ride a motor arm); flips static when the prop is on.
    expect(spawner.isStatic(spawner.defaults)).toBe(false);
    expect(spawner.isStatic({ ...spawner.defaults, static: true })).toBe(true);
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

  it("exposes a property schema covering each type's editable props", () => {
    const keys = (d: BodyTypeDef) => d.propSchema.map((f) => f.key);
    expect(keys(def("platform"))).toEqual(
      expect.arrayContaining(["width", "height", "friction", "static"]),
    );
    expect(keys(def("ball"))).toEqual(
      expect.arrayContaining(["radius", "friction", "restitution", "density"]),
    );
  });

  it("every schema field has a matching default value", () => {
    for (const d of bodyTypes()) {
      for (const field of d.propSchema) {
        expect(d.defaults).toHaveProperty(field.key);
        const expected = field.kind === "boolean" ? "boolean" : "number";
        expect(typeof d.defaults[field.key]).toBe(expected);
      }
    }
  });

  it("declares no render-only marks (the spinning hachure fill shows rotation)", () => {
    expect(def("ball").marks).toBeUndefined();
    expect(def("platform").marks).toBeUndefined();
  });

  it("marks platforms static by default but balls dynamic", () => {
    expect(def("platform").isStatic(def("platform").defaults)).toBe(true);
    expect(def("ball").isStatic(def("ball").defaults)).toBe(false);
  });

  it("offers spring, motor, weld, and pin as connector types", () => {
    expect(connectorTypes().map((c) => c.type)).toEqual(["spring", "motor", "weld", "pin"]);
  });

  it("gives the motor speed, torque, and direction props with defaults", () => {
    const motor = connectorDef("motor");
    expect(motor.propSchema.map((f) => f.key)).toEqual(["speed", "torque", "reverse"]);
    const conn = makeConnector("motor", { world: { x: 0, y: 0 } }, { body: "b", local: { x: 0, y: 0 } });
    expect(conn.props).toEqual(motor.defaults);
    expect(conn.props).not.toBe(motor.defaults); // copied, not shared
  });
});
