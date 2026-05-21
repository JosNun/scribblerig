# ADR-0004 — Rendering: Canvas 2D + cached Rough.js drawables

Status: accepted
Date: 2026-05-21

## Context

The product wants a hand-drawn doodle aesthetic. Rough.js produces that look, but it
adds fresh random wobble **every time it draws a shape**. Naively redrawing each
frame makes a moving body's outline crawl with noise ("shimmer"), which looks
unintentional, and re-roughening every shape every frame is also wasteful.

## Decision

Render with **Rough.js over Canvas 2D** (not SVG, not Rapier's debug renderer). For
each shape, **generate the rough drawable once and cache it**; per frame the renderer
only translates/rotates the canvas context and redraws the cached drawable. The
wobble is "baked" per shape and moves rigidly with the body.

- A fixed `seed` per body keeps its wobble stable across regenerations.
- The drawable cache is keyed by a signature capturing everything that affects shape
  (id + type + size), so a shape is regenerated only when its geometry actually
  changes.
- Camera math (meters → pixels, y-flip, later pan/zoom) lives in a **pure `camera`
  module** that is unit-tested; the impure `renderer` consumes it.

## Consequences

- Per-frame cost is just canvas transforms + cached redraws — cheap and shimmer-free.
- A future "plotter / pen tool" (bodies depositing marks on a background layer) fits
  this layering cleanly; left room for it but out of scope for v1.
