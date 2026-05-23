import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SharePopover } from "./SharePopover";
import { addBody, createScene, type Scene } from "../scene/scene";
import { makeBody } from "../registry/registry";
import { encodedLength } from "../share/storage";
import { AUTO_PROMOTE_THRESHOLD } from "../share/shortlink";

/** Grow a scene until its encoded length exceeds the auto-promote threshold. */
function oversizedScene(): Scene {
  let s = createScene();
  let i = 0;
  while (encodedLength(s) <= AUTO_PROMOTE_THRESHOLD) {
    // Random positions defeat pako's repetition compression.
    s = addBody(s, 0, makeBody("ball", { x: Math.random() * 10, y: Math.random() * 10 })).scene;
    if (++i > 500) throw new Error("scene didn't grow large enough");
  }
  return s;
}

/**
 * Static-markup smoke tests for the Share popover. Click + clipboard +
 * fetch behaviours are exercised through the running app; here we lock in
 * the *structure* (the title field exists and is pre-filled, the Copy
 * button exists, the auto-promote hint behaves correctly, etc.).
 */
describe("SharePopover", () => {
  function smallScene(title?: string): Scene {
    let s = createScene();
    s = addBody(s, 0, makeBody("ball", { x: 0, y: 1 })).scene;
    if (title) s.title = title;
    return s;
  }

  it("renders a name input pre-filled from scene.title", () => {
    const html = renderToStaticMarkup(
      <SharePopover scene={smallScene("My machine")} onRenameScene={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("share-name-input");
    expect(html).toContain(`value="My machine"`);
  });

  it("starts with an empty name input when the scene has no title", () => {
    const html = renderToStaticMarkup(
      <SharePopover scene={smallScene()} onRenameScene={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("share-name-input");
    expect(html).toContain(`value=""`);
  });

  it("renders a Copy and Close button", () => {
    const html = renderToStaticMarkup(
      <SharePopover scene={smallScene()} onRenameScene={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain(">Copy link<");
    expect(html).toContain(">Close<");
  });

  it("does not show the auto-promote hint for a small un-named scene", () => {
    const html = renderToStaticMarkup(
      <SharePopover scene={smallScene()} onRenameScene={() => {}} onClose={() => {}} />,
    );
    expect(html).not.toContain("short link automatically");
  });

  it("shows the auto-promote hint for an oversized un-named scene", () => {
    const html = renderToStaticMarkup(
      <SharePopover scene={oversizedScene()} onRenameScene={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("short link automatically");
  });

  it("does not show the auto-promote hint when the user has named the scene", () => {
    const big = oversizedScene();
    big.title = "Named explicitly";
    const html = renderToStaticMarkup(
      <SharePopover scene={big} onRenameScene={() => {}} onClose={() => {}} />,
    );
    // Has the title; auto-promote message redundant.
    expect(html).not.toContain("short link automatically");
  });
});
