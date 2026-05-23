import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bodyTypes, connectorTypes, type PropField } from "../registry/registry";
import { PropertyPanel } from "./PropertyPanel";

/**
 * Static-markup tests for the schema-driven property panel. We render with
 * `renderToStaticMarkup` (works in the project's node Vitest env, no jsdom
 * needed) and assert on the produced HTML. Click behaviour isn't testable here
 * — those handlers live in React's runtime — but the *structure* (does a
 * boolean field render a doodle checkbox? does a number field render a
 * scrubber?) is, and that's the contract this panel guarantees.
 */
describe("PropertyPanel", () => {
  it("renders a doodle checkbox for boolean fields", () => {
    const schema: PropField[] = [
      { key: "static", label: "Static", kind: "boolean" },
    ];
    const html = renderToStaticMarkup(
      <PropertyPanel
        title="Platform"
        schema={schema}
        props={{ static: true }}
        onChange={() => {}}
      />,
    );
    // The doodle checkbox wrapper + its invisible real input must both be
    // present, and the input's `checked` should reflect the prop value.
    expect(html).toContain(`class="doodle-check"`);
    expect(html).toContain(`class="doodle-check__input"`);
    expect(html).toContain(`type="checkbox"`);
    expect(html).toContain(`checked=""`);
  });

  it("renders the doodle checkbox unchecked when the value is false", () => {
    const schema: PropField[] = [
      { key: "static", label: "Static", kind: "boolean" },
    ];
    const html = renderToStaticMarkup(
      <PropertyPanel
        title="Platform"
        schema={schema}
        props={{ static: false }}
        onChange={() => {}}
      />,
    );
    // No `checked` attribute when value is false.
    expect(html).toContain(`class="doodle-check"`);
    expect(html).not.toMatch(/<input[^>]*class="doodle-check__input"[^>]*checked/);
  });

  it("renders a number scrubber + number box for number fields", () => {
    const schema: PropField[] = [
      { key: "radius", label: "Radius", kind: "number", min: 0.1, max: 3, step: 0.1 },
    ];
    const html = renderToStaticMarkup(
      <PropertyPanel
        title="Ball"
        schema={schema}
        props={{ radius: 0.5 }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain(`class="prop-num"`); // number box
    expect(html).toContain(`class="scrubber scrubber-rough"`); // doodle scrubber
    expect(html).toContain(`role="slider"`); // a11y on scrubber
    expect(html).toContain(`aria-valuenow="0.5"`);
    expect(html).toContain(`aria-valuemin="0.1"`);
    expect(html).toContain(`aria-valuemax="3"`);
  });

  it("renders both a number scrubber and a doodle checkbox when the schema has both", () => {
    const schema: PropField[] = [
      { key: "friction", label: "Friction", kind: "number", min: 0, max: 1, step: 0.05 },
      { key: "static", label: "Static", kind: "boolean" },
    ];
    const html = renderToStaticMarkup(
      <PropertyPanel
        title="Platform"
        schema={schema}
        props={{ friction: 0.6, static: true }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain(`class="scrubber scrubber-rough"`);
    expect(html).toContain(`class="doodle-check"`);
  });

  it("shows the empty state when the schema has no fields", () => {
    const html = renderToStaticMarkup(
      <PropertyPanel title="Weld" schema={[]} props={{}} onChange={() => {}} />,
    );
    expect(html).toContain("No adjustable properties.");
  });

  // Sweep test — every registered body/connector type's schema must render
  // through the generic panel without throwing or producing unrecognised
  // field kinds. This is the schema-driven invariant from the PRD: adding a
  // field surfaces a control with no per-type code, so the panel must
  // tolerate every kind every type uses.
  describe("renders every registered type", () => {
    for (const def of bodyTypes()) {
      it(`renders body type: ${def.type}`, () => {
        const html = renderToStaticMarkup(
          <PropertyPanel
            title={def.label}
            schema={def.propSchema}
            props={def.defaults}
            onChange={() => {}}
          />,
        );
        expect(html).toContain(`>${def.label}<`);
        // No unrecognised kinds fell through to an empty <div>: every field
        // contributes a row.
        if (def.propSchema.length > 0) {
          const rows = html.match(/class="prop-row/g) ?? [];
          expect(rows.length).toBeGreaterThanOrEqual(def.propSchema.length);
        }
      });
    }
    for (const def of connectorTypes()) {
      it(`renders connector type: ${def.type}`, () => {
        const html = renderToStaticMarkup(
          <PropertyPanel
            title={def.label}
            schema={def.propSchema}
            props={def.defaults}
            onChange={() => {}}
          />,
        );
        expect(html).toContain(`>${def.label}<`);
      });
    }
  });

  it("renders a doodle dial for angle fields", () => {
    const schema: PropField[] = [
      { key: "heading", label: "Heading", kind: "angle" },
    ];
    const html = renderToStaticMarkup(
      <PropertyPanel
        title="Test"
        schema={schema}
        props={{ heading: 90 }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain(`class="doodle-dial"`);
    // Dial uses the slider ARIA pattern in 0..360 space.
    expect(html).toContain(`role="slider"`);
    expect(html).toContain(`aria-valuenow="90"`);
    expect(html).toContain(`aria-valuemin="0"`);
    expect(html).toContain(`aria-valuemax="360"`);
  });
});
