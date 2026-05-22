# 18 — Per-tab sessions + a saved-builds list

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

Autosave ([issue 08](08-share-via-url-and-autosave.md)) persists a single scene
under one localStorage key, so every tab of the app shares — and clobbers — the
same build. We want **multiple tabs to hold different builds**, and a way to
**browse and reopen past builds**.

## Decisions (from the developer)

- **Tab identity in `sessionStorage`.** Each tab carries a session id in
  `sessionStorage` (per-tab, survives reload). A fresh tab/window has none, so it
  mints a new one. (Chrome copies `sessionStorage` on "Duplicate tab" — accepted
  edge case: the duplicate shares the id.)
- **Per-session scenes in `localStorage`**, plus an index so builds are listable
  and survive a browser restart:
  - `scribblerig:scene:<id>` — the encoded scene (reuses the tolerant
    [codec](../../src/share/codec.ts)).
  - `scribblerig:sessions` — index of `{ id, title, updatedAt }`.
  - `scribblerig:sid` (sessionStorage) — this tab's id.
- **New tab = resume the most-recent build as a *lazy fork*.** A fresh tab shows
  the most-recent build's content under a new id, but does **not** create a real
  session until the **first edit**. So glance-and-close tabs leave no clutter,
  edits never clobber the source build, and a reload keeps the tab's own session
  (via the `sessionStorage` id). With no prior builds it shows the default scene.
- **Migration.** Fold the existing single `scribblerig:scene` autosave into a
  first session so current work isn't lost.
- **Shared links** open into their own (lazy) session; the imported `#…` is still
  stripped from the URL after load.

## What to build

- **`share/sessions`** (pure, tested) — the index logic that doesn't touch the
  browser: `deriveTitle(scene)` (e.g. "5 objects"), `upsertSession`,
  `sortByRecent`, `removeSession`.
- **`share/storage`** (impure shell) — rework around sessions: `bootSession()`
  (returns `{ id, scene }` per the resume/lazy-fork rules, migrating the old key
  and clearing a shared hash), `saveSession(id, scene)` (encode + upsert index;
  the first call materializes a lazy fork), `listSessions`, `loadSession`,
  `deleteSession`, `renameSession`, and the existing `shareUrl`.
- **`ui`** — a **Builds** affordance (a button in the actions row) opening a list
  of saved builds: each row shows title + relative time, with load, rename, and
  delete; a **New build** entry starts an empty (lazy) session; the current tab's
  session is marked. Works in both the desktop floating layout and the mobile
  drawer.
- **App integration** — boot the scene + session id from `bootSession`; autosave
  (debounced, only after a real edit so lazy forks stay lazy) writes via
  `saveSession`; loading/creating a build switches the tab's session (and drops
  to build mode).

## Acceptance criteria

- [x] Two tabs hold independent builds; editing one never changes the other.
- [x] A fresh tab opens with the most-recent build's content but, once edited,
      saves as its own session (the original stays intact); an unedited
      glance-and-close tab creates nothing.
- [x] Reloading a tab restores that tab's build.
- [x] A Builds list shows saved builds and can load, rename, and delete them, and
      start a new build; the current build is indicated.
- [x] Pre-existing single-key autosave is migrated into a session, not lost.
- [x] Pure index/title logic is unit-tested; storage glue verified in-browser.

## Comments

### 2026-05-22 — Implemented

Pure **`share/sessions`** (title/index logic, 5 tests) + impure
**`share/storage`** reworked around per-tab sessions: `bootSession`,
per-session `saveSession` (autosave skipped until the first edit so lazy forks
stay lazy), `listSessions`/`loadSession`/`adoptSession`/`newSession`/
`deleteSession`/`renameSession`, and the existing `shareUrl`. A **Builds** button
opens an overlay listing saved builds (rename inline, open, delete, + New build;
current marked). See [ADR-0008](../../adr/0008-tolerant-share-and-autosave.md).

84 tests pass. Verified each path in-browser: a fresh tab stays lazy (no build
on open) and materializes only on the first edit; new build starts empty and
lazy; opening a build switches the tab's scene; rename/delete persist; a
fresh-tab lazy fork resumes the most-recent content under a new id without
touching the original; stable reload keeps the tab's own build; and the legacy
single-key autosave migrates into a session.

### 2026-05-22 — Build previews

Each build now saves a **thumbnail** alongside it: the scene rendered
fit-to-room into a small offscreen canvas (transparent PNG, paper shows through
via CSS), stored under its own `scribblerig:thumb:<id>` key. The Builds list
shows it next to the name so a build is recognizable at a glance rather than by
title alone. Verified in-browser: editing regenerates the preview and it renders
in the list.

## Notes

- Builds on [issue 08](08-share-via-url-and-autosave.md) (codec + autosave) and
  [ADR-0008](../../adr/0008-tolerant-share-and-autosave.md). Decode stays
  tolerant, so an old saved build degrades gracefully like a shared link.
- Camera stays local/unserialized, so switching builds doesn't carry a viewport.
