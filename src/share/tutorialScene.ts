/**
 * The onboarding tutorial scene: a single playable Rube-Goldberg chain that
 * exercises every body and connector type and surfaces the most pedagogically
 * load-bearing props (especially Static on/off). Hand-authored — see
 * `.scratch/onboarding-tutorial/CHAIN.md` for the stage-by-stage rationale.
 *
 * Chain order (hybrid — one projectile relays into another at the spring):
 *   Spawner → Ramp → Pendulum (Pin + Weld'd head) ──┐
 *                                                   │  energy handoff
 *                                       (welded head strikes puck)
 *                                                   │
 *                            Spring-suspended Puck ─┘ → Motor paddle → Goal
 *
 * Wiring this into `bootSession` and the "Show tutorial" button is the next
 * step (PRD); this constant is the scene itself.
 */

import type { Scene } from "../scene/scene";

export const TUTORIAL_TITLE = "Tutorial";

export const tutorialScene: Scene = {
  version: 1,
  // Bumped to one past the highest id used below (c24). New bodies/connectors
  // added by the user mint from b25 / c25 onward.
  nextId: 25,
  title: TUTORIAL_TITLE,
  rooms: [
    {
      settings: {
        gravity: { x: 0, y: -9.81 },
        walls: { floor: true, ceiling: false, left: false, right: false },
        size: { width: 12, height: 12 },
        snap: false,
      },
      bodies: [
        // ───── Stage 1: spawner ─────
        // Rotation -π/2 aims the chute at -y (straight down). interval=30 with
        // maxAlive=1 means one ball plays the whole chain per Reset — first
        // emit at T=1s (sim warmup), next at T=31s. The user sees the chain
        // start to finish on a clean run.
        {
          id: "b1",
          type: "spawner",
          position: { x: -4.5, y: 10 },
          rotation: -Math.PI / 2,
          props: { interval: 30, maxAlive: 1, speed: 0, static: true },
          template: {
            bodies: [
              {
                id: "b2",
                type: "ball",
                position: { x: 0, y: 0 },
                rotation: 0,
                props: { radius: 0.3, friction: 0.5, restitution: 0.5, density: 1 },
              },
            ],
            connectors: [],
          },
        },

        // ───── Stage 2: ramp (static contrast — on) ─────
        {
          id: "b3",
          type: "platform",
          position: { x: -3, y: 7 },
          rotation: -0.25,
          props: { width: 3.5, height: 0.3, friction: 0.5, static: true },
        },

        // Static-off contrast block — a small dynamic platform resting on the
        // floor below the ramp. Sits still under gravity but can be pushed by
        // ball₁ or by the user dragging it. Makes the Static toggle tangible.
        {
          id: "b4",
          type: "platform",
          position: { x: -3, y: 0.4 },
          rotation: 0,
          props: { width: 1, height: 0.3, friction: 0.5, static: false, density: 1 },
        },

        // ───── Stage 3+4: pendulum (Pin'd arm + Weld'd heavy head) ─────
        // Thin vertical platform pin'd at the top, heavy ball welded at the
        // bottom. Hangs straight down at rest. Ball₁ from the ramp strikes the
        // arm or head, swinging the pendulum sideways — the head arcs into
        // the spring puck.
        {
          id: "b5",
          type: "platform",
          position: { x: 1, y: 4.5 },
          rotation: 0,
          props: { width: 0.2, height: 3, friction: 0.5, static: false },
        },
        {
          id: "b6",
          type: "ball",
          position: { x: 1, y: 2.5 },
          rotation: 0,
          // density 4 makes this a *heavy* head — pedagogical: heavier weight
          // → harder hit. Surfaced in the "Weld + heavy = hammer" label.
          props: { radius: 0.5, friction: 0.6, restitution: 0.3, density: 4 },
        },

        // ───── Stage 5: spring-suspended puck ─────
        // Ball held in mid-air by a vertical Spring to a fixed world anchor
        // above. Pendulum head strikes it, spring releases the energy into a
        // controlled rebound toward the motor below.
        {
          id: "b7",
          type: "ball",
          position: { x: 3, y: 2.5 },
          rotation: 0,
          props: { radius: 0.35, friction: 0.4, restitution: 0.4, density: 1 },
        },

        // ───── Stage 6: motor paddle (hub + Weld'd blade) ─────
        {
          id: "b8",
          type: "ball",
          position: { x: 4, y: 1.2 },
          rotation: 0,
          props: { radius: 0.15, friction: 0.6, restitution: 0.2, density: 1 },
        },
        {
          id: "b9",
          type: "platform",
          position: { x: 4, y: 1.2 },
          rotation: 0,
          props: { width: 1.4, height: 0.15, friction: 0.7, static: false },
        },

        // ───── Stage 7: goal platform ─────
        {
          id: "b10",
          type: "platform",
          position: { x: 5.2, y: 0.5 },
          rotation: -0.05,
          props: { width: 1.8, height: 0.3, friction: 0.7, static: true },
        },

        // ───── Text labels ─────
        {
          id: "b11",
          type: "text",
          position: { x: 0, y: 11 },
          rotation: 0,
          props: {
            text: "Welcome — press ▶ Play. Click anything to tinker.",
            size: 0.45,
            static: true,
          },
        },
        {
          id: "b12",
          type: "text",
          position: { x: -4.5, y: 9.3 },
          rotation: 0,
          props: { text: "Spawner — drops things on a timer", size: 0.28, static: true },
        },
        {
          id: "b13",
          type: "text",
          position: { x: -3, y: 8.2 },
          rotation: 0,
          props: { text: "Static = won't move", size: 0.28, static: true },
        },
        {
          id: "b14",
          type: "text",
          position: { x: -3, y: 1.2 },
          rotation: 0,
          props: { text: "Static off → free to move", size: 0.28, static: true },
        },
        {
          id: "b15",
          type: "text",
          position: { x: 1.9, y: 6 },
          rotation: 0,
          props: { text: "Pin = free hinge", size: 0.28, static: true },
        },
        {
          id: "b16",
          type: "text",
          position: { x: 2, y: 2.5 },
          rotation: 0,
          props: { text: "Weld + heavy = hammer", size: 0.28, static: true },
        },
        {
          id: "b17",
          type: "text",
          position: { x: 3.8, y: 3 },
          rotation: 0,
          props: { text: "Spring — tune stiffness", size: 0.28, static: true },
        },
        {
          id: "b18",
          type: "text",
          position: { x: 4, y: 2.2 },
          rotation: 0,
          props: { text: "Motor — powered hinge", size: 0.28, static: true },
        },
        {
          id: "b19",
          type: "text",
          position: { x: 5.2, y: 1.3 },
          rotation: 0,
          props: { text: "Goal", size: 0.28, static: true },
        },
      ],
      connectors: [
        // Pin pendulum arm at its top to a fixed world anchor.
        {
          id: "c20",
          type: "pin",
          a: { world: { x: 1, y: 6 } },
          b: { body: "b5", local: { x: 0, y: 1.5 } },
          props: {},
        },
        // Weld the heavy head to the bottom of the pendulum arm. Endpoints
        // line up at world (1, 3) — head top touches arm bottom.
        {
          id: "c21",
          type: "weld",
          a: { body: "b6", local: { x: 0, y: 0 } },
          b: { body: "b5", local: { x: 0, y: -1.5 } },
          props: {},
        },
        // Spring suspends the puck below a fixed world anchor. At start, the
        // distance (1.5) exceeds restLength (1) — spring is stretched, pulling
        // puck up against gravity. Settles a hair above the start position.
        {
          id: "c22",
          type: "spring",
          a: { world: { x: 3, y: 4 } },
          b: { body: "b7", local: { x: 0, y: 0 } },
          props: { stiffness: 60, restLength: 1, damping: 3, collide: false },
        },
        // Weld motor blade to hub.
        {
          id: "c23",
          type: "weld",
          a: { body: "b8", local: { x: 0, y: 0 } },
          b: { body: "b9", local: { x: 0, y: 0 } },
          props: {},
        },
        // Motor pinned at hub's world position.
        {
          id: "c24",
          type: "motor",
          a: { world: { x: 4, y: 1.2 } },
          b: { body: "b8", local: { x: 0, y: 0 } },
          props: { speed: 2.5, torque: 30, reverse: false },
        },
      ],
    },
  ],
};
