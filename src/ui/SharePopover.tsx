import { useEffect, useState } from "react";
import type { Scene } from "../scene/scene";
import { encodeScene } from "../share/codec";
import {
  AUTO_PROMOTE_THRESHOLD,
  mintShortlink,
  shouldMintShortlink,
} from "../share/shortlink";
import { deriveTitle } from "../og/deriveTitle";
import { DoodleBorder } from "./DoodleBorder";

/**
 * Share popover (og-share issue 03). Centered overlay with:
 *  - an optional name input that round-trips through `scene.title`,
 *  - a Copy button that picks between the `?s=` URL and a freshly-minted
 *    `/s/<id>` shortlink based on whether the user named the build (or
 *    the encoded URL would be too long for some chat apps),
 *  - the resulting URL inline so the user can see what they copied.
 *
 * Naming a build mutates the scene's `title` via `onRenameScene`, so the
 * autosave system stores it under the current session and the OG meta
 * works even if the user later reopens the build and re-shares with the
 * same name.
 */
export function SharePopover({
  scene,
  onRenameScene,
  onClose,
}: {
  scene: Scene;
  onRenameScene: (title: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(scene.title ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the input back into the scene's title so autosave + future
  // shortlinks pick up the new name. Trimmed on store so empty input
  // drops the title field entirely (codec sanitiser handles whitespace).
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed !== (scene.title ?? "")) {
      onRenameScene(trimmed);
    }
    // We intentionally don't include onRenameScene in the dep array —
    // the parent recreates it every render, which would cause a write
    // loop. The name field is the source of truth here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Compose a preview of which path will run, so the UI can hint why
  // a shortlink is being minted even without an explicit name.
  const trimmedName = name.trim();
  const sceneForShare = trimmedName ? { ...scene, title: trimmedName } : { ...scene, title: undefined };
  const encodedNow = encodeScene(sceneForShare);
  const willMint = shouldMintShortlink({
    encodedLength: encodedNow.length,
    hasTitle: trimmedName !== "",
  });
  const promotedForSize = !trimmedName && encodedNow.length > AUTO_PROMOTE_THRESHOLD;

  const copy = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      let finalUrl: string;
      if (willMint) {
        // Mint a shortlink. Use the derived title if the user left the
        // field blank but the scene is being auto-promoted — that way
        // the OG preview still says something meaningful.
        const titleForMint = trimmedName || deriveTitle(scene);
        const minted = await mintShortlink(encodedNow, titleForMint);
        finalUrl = minted.url;
      } else {
        finalUrl = `${location.origin}${location.pathname}?s=${encodedNow}`;
      }
      setUrl(finalUrl);
      try {
        await navigator.clipboard.writeText(finalUrl);
      } catch {
        window.prompt("Copy this link:", finalUrl);
      }
      setCopied(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "RATE_LIMITED") {
        setError("Too many shares in a minute — try again shortly.");
      } else {
        // Network or worker failure — degrade gracefully to the `?s=`
        // form so the user always gets *some* working URL.
        const fallback = `${location.origin}${location.pathname}?s=${encodedNow}`;
        try {
          await navigator.clipboard.writeText(fallback);
          setUrl(fallback);
          setCopied(true);
          setError("Couldn't create a short link. Copied the long URL instead.");
        } catch {
          setError("Couldn't create a share link. Try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="share-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="panel share-panel" onClick={(e) => e.stopPropagation()}>
        <DoodleBorder strokeWidth={2.5} />
        <div className="prop-title">Share this build</div>

        <label className="share-field">
          <span className="prop-label">Name (optional)</span>
          <span className="num-frame share-name-frame">
            <DoodleBorder strokeWidth={1.8} />
            <input
              type="text"
              maxLength={80}
              className="prop-num share-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name it (optional)"
              disabled={loading}
              autoFocus
            />
          </span>
        </label>

        {promotedForSize && !error && (
          <div className="share-hint">
            Long scene — we'll use a short link automatically.
          </div>
        )}

        {url && (
          <div className="share-field">
            <span className="prop-label">Link</span>
            <span className="num-frame share-url-frame">
              <DoodleBorder strokeWidth={1.8} />
              <input
                type="text"
                readOnly
                value={url}
                className="prop-num share-url-input"
                onFocus={(e) => e.currentTarget.select()}
              />
            </span>
          </div>
        )}

        {error && <div className="share-error">{error}</div>}

        <div className="share-actions">
          <button onClick={copy} disabled={loading} className="share-copy-btn">
            <DoodleBorder interactive />
            <span>{copied ? "Copied!" : loading ? "Linking…" : "Copy link"}</span>
          </button>
          <button onClick={onClose} className="share-close-btn">
            <DoodleBorder interactive />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
