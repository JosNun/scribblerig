/**
 * The play/pause/reset state machine plus a fixed-timestep accumulator,
 * fully decoupled from render framerate.
 *
 * The render loop calls `advance(elapsed)` each frame with real wall-clock
 * elapsed time; the clock accumulates it and returns how many *fixed* steps
 * the simulation should run now, retaining any sub-step remainder for the next
 * frame. This gives same-machine reproducibility: the same sequence of steps
 * runs regardless of how the frames were chopped up.
 */

export type ClockState = "build" | "running" | "paused";

export interface Clock {
  readonly fixedDt: number;
  readonly state: ClockState;
  /** Accumulate elapsed seconds; return the number of fixed steps to run now. */
  advance(elapsedSeconds: number): number;
  play(): void;
  pause(): void;
  reset(): void;
}

class FixedClock implements Clock {
  readonly fixedDt: number;
  private accumulated = 0;
  private _state: ClockState = "build";

  constructor(fixedDt: number) {
    this.fixedDt = fixedDt;
  }

  get state(): ClockState {
    return this._state;
  }

  advance(elapsedSeconds: number): number {
    this.accumulated += elapsedSeconds;
    // Tolerate floating-point drift at the step boundary: an accumulator that
    // lands a hair under fixedDt (e.g. 0.05 + 0.05 = 0.0999…9) must still fire,
    // or the loop slowly leaks fixed steps over time.
    const threshold = this.fixedDt * (1 - 1e-9);
    let steps = 0;
    while (this.accumulated >= threshold) {
      this.accumulated -= this.fixedDt;
      steps++;
    }
    return steps;
  }

  play(): void {
    this._state = "running";
  }

  pause(): void {
    // Pausing only matters mid-run; ignore from the build state.
    if (this._state === "running") this._state = "paused";
  }

  reset(): void {
    this._state = "build";
    this.accumulated = 0;
  }
}

export function createClock(fixedDt = 1 / 60): Clock {
  return new FixedClock(fixedDt);
}
