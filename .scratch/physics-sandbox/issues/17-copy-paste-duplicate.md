# 17 — Copy / paste and alt-drag duplicate

Status: ready-for-agent

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

Let people copy an existing entity instead of rebuilding it from the palette and
re-tuning every property. Two gestures, ideally sharing one underlying "clone an
entity" operation:

- **Copy / paste** — `Cmd/Ctrl+C` copies the current selection; `Cmd/Ctrl+V`
  pastes a duplicate (offset slightly from the original, or at the pointer) and
  selects it. (`Cmd/Ctrl+D` duplicate-in-place is a nice shorthand for both.)
- **Alt/Option-drag duplicate** — holding Alt/Option while dragging a body
  leaves the original in place and drags a fresh copy, the familiar
  vector-editor gesture. The existing body-drag path (`onCanvasPointerDown` →
  `dragOffsetRef`) is the hook: on pointerdown with Alt held, clone first, then
  drag the clone.

The clone is a deep copy of the entity with **fresh ids** (mint from
`scene.nextId`, same as `addBody`/`addConnector`) so it's independent — editing
the copy's props doesn't touch the original.

## Decisions (from the developer)

- **Selection scope** — for now, copy/paste acts on **the single current
  selection only**. Multi-entity copy is deferred to a future **multi-select**
  capability (worth adding at some point); once that lands, copy naturally
  extends to all selected entities (and the "copy a body's attached connectors"
  rule below becomes a multi-select case rather than a special rule).
- **Clipboard scope** — do **both**: write the share text (scene-serialized
  payload, reusing [issue 08](08-share-via-url-and-autosave.md)) to the **system
  clipboard** via the Clipboard API, *and* keep an **in-app ref** as the
  primary, permission-free clipboard. The Clipboard API can hold multiple
  content types, so the system copy can carry the share text for cross-tab/
  external paste while the in-app ref drives normal in-app paste.
- **Mobile** — a **Duplicate** button in the selection's actions covers touch
  (no Alt/Cmd there) and is the simplest first cut for every platform.
- **Build-mode only** — yes; copy/paste edits the design graph, so gate it on
  build mode like the other editing ops, and keep it inert while typing in a
  field (same guard as Delete/Backspace).
- **Paste position** — **hybrid**, matched to each gesture: Alt-drag places at
  the pointer (inherent to the drag); paste (`Cmd/Ctrl+V`) lands at the pointer
  when it's over the canvas, else a cascading offset from the source; duplicate
  (`Cmd/Ctrl+D` / mobile button) uses a small cascading offset from the
  original. All paste/duplicate results must respect `clampInsideRoom`.

## Acceptance criteria

- [ ] A selected body can be duplicated into an independent copy with fresh ids;
      editing the copy doesn't affect the original.
- [ ] At least one fast gesture works on desktop (Cmd/Ctrl+C/V, Cmd/Ctrl+D, or
      Alt-drag) and one affordance works on touch (e.g. a Duplicate button).
- [ ] Duplicates land inside the room (`clampInsideRoom`) and are auto-selected.
- [ ] Editing shortcuts stay inert while typing in a property field (see the
      Delete/Backspace guard) and outside build mode.

## Notes

- Related: [issue 08](08-share-via-url-and-autosave.md) (scene serialization —
  the clone payload can reuse it), and the recent cycle-select work (a duplicate
  should auto-select like other create ops).
