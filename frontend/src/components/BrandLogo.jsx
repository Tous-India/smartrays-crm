import logoColor from "../assets/logo.png";
import logoWhiteShadow from "../assets/logo-white-shadow.png";

const LOGO_SOURCES = {
  color: logoColor,
  // Plain white (logo-white.png, no shadow) was tested and rejected — it has
  // no built-in contrast mechanism, so it disappears against the bright sky
  // portion of the login photo background. This variant has a soft glow
  // baked into the asset itself, giving it reliable contrast regardless of
  // what's directly behind it (unlike plain white, which depends entirely on
  // the scrim underneath being dark enough everywhere).
  white: logoWhiteShadow,
};

/**
 * The Smartrays Solutions logo. Used on the Login page and the main app
 * shell's sidebar header — one component so both stay in sync if the asset
 * ever changes. `className` controls sizing (width, typically) per call
 * site; the image itself is `h-auto` so it never stretches out of its
 * native aspect ratio.
 *
 * `variant="color"` (default) is the original navy/green mark — used
 * everywhere except where explicitly overridden, so the sidebar (on a
 * white background) is untouched by this prop's addition. `variant="white"`
 * is for AuthLayout's photo background (§ frontend/README.md's Login
 * background section) where the color icon's dark strokes can blend into a
 * busy/dark photo.
 */
function BrandLogo({ className = "w-40", variant = "color" }) {
  return <img src={LOGO_SOURCES[variant]} alt="Smartrays Solutions" className={`h-auto ${className}`} />;
}

export default BrandLogo;
