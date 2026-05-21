import { describe, it, expect } from "vitest";
import { createClock } from "./clock";

describe("clock accumulator", () => {
  it("runs floor(accumulated / fixedDt) steps and retains the remainder", () => {
    const clock = createClock(0.1);

    // 0.25s of elapsed time at a 0.1s step = 2 steps, 0.05s left over.
    expect(clock.advance(0.25)).toBe(2);
    // The retained 0.05s plus another 0.05s reaches one more full step.
    expect(clock.advance(0.05)).toBe(1);
    // Nothing left to run.
    expect(clock.advance(0)).toBe(0);
  });

  it("catches up with multiple steps after a long frame", () => {
    const clock = createClock(0.1);
    // A single long 0.55s frame should run 5 catch-up steps, keeping 0.05s.
    expect(clock.advance(0.55)).toBe(5);
    expect(clock.advance(0.05)).toBe(1);
  });
});

describe("clock state machine", () => {
  it("transitions build → running → paused → running", () => {
    const clock = createClock(0.1);
    expect(clock.state).toBe("build");

    clock.play();
    expect(clock.state).toBe("running");

    clock.pause();
    expect(clock.state).toBe("paused");

    clock.play();
    expect(clock.state).toBe("running");
  });

  it("reset returns to build and discards the accumulated remainder", () => {
    const clock = createClock(0.1);
    clock.play();
    clock.advance(0.05); // leaves 0.05s in the accumulator

    clock.reset();

    expect(clock.state).toBe("build");
    // The previously banked 0.05s is gone, so this 0.05s alone runs no step.
    expect(clock.advance(0.05)).toBe(0);
  });
});
