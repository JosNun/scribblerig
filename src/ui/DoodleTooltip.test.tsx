import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DoodleTooltip, DoodleTooltipProvider } from "./DoodleTooltip";

/**
 * Static-markup smoke tests for the doodle tooltip. Radix owns the open/close
 * timing and the floating positioning; we own only the shape of what's
 * mounted at render time — the trigger, its accessibility attributes, and
 * the disabled-button wrapping pattern. Interactive open/close is exercised
 * through Radix's own tests + the running app.
 */
describe("DoodleTooltip", () => {
  it("renders its child trigger inside a Tooltip.Provider", () => {
    const html = renderToStaticMarkup(
      <DoodleTooltipProvider>
        <DoodleTooltip content="Play">
          <button aria-label="Play">P</button>
        </DoodleTooltip>
      </DoodleTooltipProvider>,
    );
    // The trigger button is present, its aria-label survives unchanged.
    expect(html).toContain(`aria-label="Play"`);
    expect(html).toContain(">P</button>");
  });

  it("preserves the `disabled` attribute on a button wrapped in a tooltip trigger span", () => {
    // The disabled-button delivery pattern: wrap the button in a span that
    // carries Radix's hover listeners. The inner button keeps its disabled
    // semantics; the span is what the cursor actually hovers.
    const html = renderToStaticMarkup(
      <DoodleTooltipProvider>
        <DoodleTooltip content="Loading physics…">
          <span className="doodle-tooltip-trigger">
            <button disabled aria-label="Play">P</button>
          </span>
        </DoodleTooltip>
      </DoodleTooltipProvider>,
    );
    expect(html).toContain(`class="doodle-tooltip-trigger"`);
    expect(html).toContain(`disabled=""`);
    expect(html).toContain(`aria-label="Play"`);
  });

  it("supports a ReactNode content value (rich labels for the help-popover case)", () => {
    const html = renderToStaticMarkup(
      <DoodleTooltipProvider>
        <DoodleTooltip
          content={
            <>
              Press to <strong>play</strong>
            </>
          }
        >
          <button>P</button>
        </DoodleTooltip>
      </DoodleTooltipProvider>,
    );
    // The trigger renders (with Radix's data-state attribute). Richer content
    // lives inside the portal and only mounts when opened, so it isn't in
    // the SSR snapshot.
    expect(html).toMatch(/<button[^>]*>P<\/button>/);
    expect(html).toContain(`data-state="closed"`);
  });

  it("does not mount tooltip content while closed (no shortcut chip in static markup)", () => {
    // Sanity: closed tooltips should not leak content into the SSR output.
    // If this fires, the portal/visibility wiring has regressed.
    const html = renderToStaticMarkup(
      <DoodleTooltipProvider>
        <DoodleTooltip content="Play" shortcut="Space">
          <button>P</button>
        </DoodleTooltip>
      </DoodleTooltipProvider>,
    );
    expect(html).not.toContain("doodle-tooltip-shortcut");
    expect(html).not.toContain("doodle-tooltip-content");
  });
});
