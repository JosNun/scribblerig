import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { DoodleBorder } from "./DoodleBorder";
import "./tooltip.css";

/**
 * Window in which we treat events as part of the just-completed tap gesture
 * (used to suppress iOS's synthetic mouse-compat click + dedupe a touchend→
 * click race). iOS dispatches the synthetic click ≤300ms after touchend, and
 * usually much sooner with `touch-action: manipulation`; 350ms covers it
 * without noticeably delaying a legitimate outside-tap to dismiss.
 */
const TAP_GESTURE_WINDOW_MS = 350;

/**
 * Hand-drawn tooltip wrapping Radix UI's Tooltip primitive.
 *
 * Behaviour matches the rest of the UI's doodle chrome — `DoodleBorder` frame,
 * Mynerve font, paper background — and inherits Radix's grouped warm-up /
 * skip-delay timing from {@link DoodleTooltipProvider} at the App root:
 *
 *  - First hover waits ~500ms.
 *  - While any tooltip is open (or within ~300ms of one closing), the next
 *    one opens instantly. Scanning Play → Pause → Reset reads like a menu.
 *  - Closes immediately on pointer leave; `:focus-visible` opens it without
 *    delay; Escape closes.
 *
 * Disabled triggers: wrap the `disabled` button in a `<span className=
 * "doodle-tooltip-trigger">` — Radix attaches its listeners to the span,
 * so hover still fires while the inner button keeps its native disabled
 * semantics:
 *
 * ```tsx
 * <DoodleTooltip content={simReady ? "Play" : "Loading physics…"}>
 *   <span className="doodle-tooltip-trigger">
 *     <button onClick={play} disabled={!simReady}>…</button>
 *   </span>
 * </DoodleTooltip>
 * ```
 *
 * Touch: tooltips don't fire on touch by default — taps run the trigger's
 * primary action without delay. For dedicated help affordances that have no
 * other action, pass `touchMode="tap"` and the tooltip toggles on tap.
 */
export function DoodleTooltip({
  content,
  shortcut,
  children,
  touchMode = "suppress",
  side = "bottom",
  align = "center",
}: {
  content: ReactNode;
  /** Small chip rendered alongside the label, e.g. "Space" for Play. */
  shortcut?: string;
  children: ReactNode;
  /**
   * `"suppress"` (default) — touch taps run the trigger's action, no tooltip.
   * `"tap"` — tap to reveal; tap outside or the trigger again to dismiss.
   * Reserved for help-only affordances.
   */
  touchMode?: "suppress" | "tap";
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}) {
  // Tap-mode: own the open state so a touch tap can toggle it. Radix's
  // default pointer behaviour ignores touch, so without this the tooltip
  // never opens on a finger.
  const [tapOpen, setTapOpen] = useState(false);
  const isTap = touchMode === "tap";
  // Wall-clock timestamp of the most recent open *and* of the touch that
  // just handled a tap (so onClick can dedupe iOS's synthetic click).
  const lastTouchRef = useRef(0);

  // Radix's `Tooltip.Trigger` unconditionally calls `onClose` on click — it's
  // a tooltip, not a popover; clicks dismiss it. In tap mode that fights our
  // toggle: our `onClick` flips state to open, then Radix's composed handler
  // calls `onOpenChange(false)` and the tooltip flashes shut. Filter Radix's
  // close requests so only opens flow through (focus, hover); closes are
  // explicit — our toggle, Escape, and outside-pointer-down on the content.
  const handleOpenChange = isTap
    ? (next: boolean) => {
        if (next) setTapOpen(true);
      }
    : undefined;

  const toggle = () => {
    setTapOpen((v) => !v);
  };

  const triggerProps = isTap
    ? {
        // iOS Safari's mouse-compatibility layer fires synthetic
        // mousemove/mousedown/mouseup/click events ~30ms after a touch tap,
        // and Radix's `DismissableLayer` deferred-click handling can dispatch
        // `onPointerDownOutside` from those — closing the tooltip we just
        // opened. Per Apple's "Handling Events" docs, calling preventDefault
        // on a touch event suppresses the entire mouse-compat sequence. So
        // we handle the toggle in `onTouchEnd` (React leaves touchend
        // active, unlike touchstart/touchmove) and short-circuit the rest
        // of the gesture.
        onTouchEnd: (e: React.TouchEvent) => {
          e.preventDefault();
          lastTouchRef.current = Date.now();
          toggle();
        },
        onClick: (e: React.MouseEvent) => {
          // Mouse / keyboard path. On touch, `onTouchEnd`'s preventDefault
          // usually suppresses this entirely — but if an older iOS still
          // fires the synthetic click, skip the duplicate toggle.
          if (Date.now() - lastTouchRef.current < TAP_GESTURE_WINDOW_MS) return;
          // Belt-and-braces: `e.preventDefault()` makes Radix's composed
          // `onClose` handler bail via the `checkForDefaultPrevented` path
          // in `composeEventHandlers`. Even if the controlled-state filter
          // above were to miss a race, this short-circuits Radix.
          e.preventDefault();
          toggle();
        },
      }
    : {};

  return (
    <>
      <Tooltip.Root open={isTap ? tapOpen : undefined} onOpenChange={handleOpenChange}>
        <Tooltip.Trigger asChild {...triggerProps}>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="doodle-tooltip-content"
            side={side}
            align={align}
            sideOffset={8}
            collisionPadding={8}
            // In tap mode these are the only paths that close the tooltip,
            // since `onOpenChange(false)` is filtered out above.
            onEscapeKeyDown={isTap ? () => setTapOpen(false) : undefined}
            onPointerDownOutside={
              isTap
                ? (e) => {
                    // If this fired within the tap-gesture window, it's
                    // iOS's synthetic event from the very tap that opened us.
                    // Suppress; the backdrop below handles real outside taps.
                    if (Date.now() - lastTouchRef.current < TAP_GESTURE_WINDOW_MS) {
                      e.preventDefault();
                      return;
                    }
                    setTapOpen(false);
                  }
                : undefined
            }
          >
            <DoodleBorder strokeWidth={1.8} roughness={1.1} />
            <span className="doodle-tooltip-text">{content}</span>
            {shortcut && <kbd className="doodle-tooltip-shortcut">{shortcut}</kbd>}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      {/* Tap-mode backdrop. While the tooltip is open, an invisible fixed
          overlay intercepts the next pointer/touch outside the tooltip and
          consumes it — so the dismissing tap can't also flip a checkbox,
          scrub a number, or click through to the canvas behind. The tooltip
          content sits at a higher z-index so it remains interactive. */}
      {isTap && tapOpen && typeof document !== "undefined" &&
        createPortal(
          <div
            className="doodle-tooltip-backdrop"
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTapOpen(false);
            }}
            onClick={(e) => {
              // Only relevant on devices where touchend didn't already fire
              // (mouse + keyboard), since touchend.preventDefault suppresses
              // the synthetic click on iOS.
              e.preventDefault();
              e.stopPropagation();
              setTapOpen(false);
            }}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * Single Provider at the App root that owns the grouped warm-up / skip-delay
 * clock all `<DoodleTooltip>`s share. Mirrors Radix defaults:
 *  - `delayDuration={500}` — first hover waits half a second.
 *  - `skipDelayDuration={300}` — once one tooltip's open (or within 300ms of
 *    closing) others open instantly.
 */
export function DoodleTooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={500} skipDelayDuration={300}>
      {children}
    </Tooltip.Provider>
  );
}
