import logoColor from "../assets/logo.png";
import logoWhiteShadow from "../assets/logo-white-shadow.png";
import logoHorizontal from "../assets/logo-horizontal.png";
import logoHorizontalWhite from "../assets/logo-horizontal-white.png";

const LOGO_SOURCES = {
  // Icon-above-text — the original mark. Used on the Login page and (until
  // the sidebar switched to `horizontal`) the app shell.
  stacked: {
    color: logoColor,
    // Plain white (logo-white.png, no shadow) was tested and rejected — it
    // has no built-in contrast mechanism, so it disappears against the
    // bright sky portion of the login photo background. This variant has a
    // soft glow baked into the asset itself, giving it reliable contrast
    // regardless of what's directly behind it (unlike plain white, which
    // depends entirely on the scrim underneath being dark enough
    // everywhere).
    white: logoWhiteShadow,
  },
  // Icon-and-text side-by-side, wide aspect ratio (~4.8:1) — for the
  // sidebar header, where a tall stacked mark would waste horizontal space
  // better spent on nav width.
  horizontal: {
    color: logoHorizontal,
    // `logo-horizontal.png` only ever existed as the navy/green gradient
    // mark — there was no pre-made white version (unlike the stacked mark's
    // dedicated `logo-white-shadow.png`). `logo-horizontal-white.png` is a
    // generated silhouette (every opaque pixel forced to solid white,
    // alpha/shape untouched — see the one-off script in the commit that
    // added this) rather than new art, needed once the sidebar background
    // went dark navy and the original gradient's navy portions would
    // otherwise blend straight into it.
    white: logoHorizontalWhite,
  },
};

/**
 * The Smartrays Solutions logo. Used on the Login page (`layout="stacked"`,
 * the default) and the main app shell's sidebar header
 * (`layout="horizontal"`) — one component so every call site stays in sync
 * if an asset ever changes. `className` controls sizing (width, typically)
 * per call site; the image itself is `h-auto` so it never stretches out of
 * its native aspect ratio.
 *
 * `variant="color"` (default) is the original navy/green mark. `variant=
 * "white"` is for dark backgrounds — AuthLayout's photo/gradient (stacked)
 * and the sidebar's dark-navy header (horizontal) — where the color mark's
 * dark strokes would otherwise blend into the background.
 */
function BrandLogo({ className = "w-40", variant = "color", layout = "stacked" }) {
  return (
    <img
      src={LOGO_SOURCES[layout][variant]}
      alt="Smartrays Solutions"
      className={`h-auto ${className}`}
    />
  );
}

export default BrandLogo;
