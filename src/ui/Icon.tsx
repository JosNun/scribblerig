import playUrl from "../assets/icons/interface/play.svg";
import pauseUrl from "../assets/icons/interface/pause.svg";
import resetUrl from "../assets/icons/interface/square.svg";
import fitUrl from "../assets/icons/interface/maximize.svg";
import deleteUrl from "../assets/icons/interface/delete.svg";
import linkUrl from "../assets/icons/interface/link.svg";
import copyUrl from "../assets/icons/interface/copy.svg";

// The icon SVGs ship with a hardcoded black fill, so we paint them as a CSS
// mask over `currentColor` instead of dropping them in as <img>. That way they
// pick up the paper-ink colour and the parent button's disabled opacity, and
// stay crisp at any size (the source viewBoxes aren't square — `contain` keeps
// each glyph's aspect ratio).
const ICONS = {
  play: playUrl,
  pause: pauseUrl,
  reset: resetUrl,
  fit: fitUrl,
  delete: deleteUrl,
  link: linkUrl,
  copy: copyUrl,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <span
      className="icon"
      aria-hidden="true"
      style={{ ["--icon" as string]: `url("${ICONS[name]}")` }}
    />
  );
}
