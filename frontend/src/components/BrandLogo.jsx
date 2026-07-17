import logo from "../assets/logo.png";

/**
 * The Smartrays Solutions logo (frontend/src/assets/logo.png, 284×152px
 * native, transparent background). Used on the Login page and the main app
 * shell's sidebar header — one component so both stay in sync if the asset
 * ever changes. `className` controls sizing (width, typically) per call
 * site; the image itself is `h-auto` so it never stretches out of its
 * native ~1.87:1 aspect ratio.
 */
function BrandLogo({ className = "w-40" }) {
  return <img src={logo} alt="Smartrays Solutions" className={`h-auto ${className}`} />;
}

export default BrandLogo;
