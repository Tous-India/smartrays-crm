import { Typography } from "antd";
import BrandLogo from "./BrandLogo";
import loginBg from "../assets/login-bg.webp";

const { Title, Paragraph } = Typography;

/**
 * Shared shell for every public auth screen (login, forgot-password,
 * reset-password) — the floating dark glass card is identical across all
 * three; only the card's contents differ per page. Extracted here once a
 * third screen needed the exact same treatment, rather than duplicating the
 * background/card markup a third time.
 *
 * `background` picks which of two backgrounds renders behind the card:
 * - `"gradient"` (default) — the original navy/green CSS gradient
 *   (`.auth-gradient-bg`, index.css). Forgot-password/reset-password still
 *   use this; only Login was asked to change.
 * - `"photo"` — a real solar-installation photo (`assets/login-bg.webp`)
 *   rendered as its own blurred layer (`.auth-photo-layer`) UNDER a
 *   separate, unblurred dark-gradient scrim layer (`.auth-photo-scrim`),
 *   both absolutely positioned behind the actual content. Two separate
 *   elements, not one `filter: blur()` on a shared container, because
 *   `filter` blurs everything inside the element it's applied to — the
 *   photo needs to blur, the logo/tagline/card sitting on top of it very
 *   much don't.
 *
 * Both backgrounds render the logo as the white-shadow variant
 * (BrandLogo.jsx), unconditionally — the color mark's dark strokes don't
 * hold up against either background: not the photo's busy/varied
 * brightness, and not the flat navy gradient either, since the mark's dark
 * navy strokes still blend into it. See frontend/README.md's Login
 * background section for the full reasoning (which photo, why blur was
 * needed on top of the scrim, overlay tuning).
 */
function AuthLayout({ children, background = "gradient" }) {
  const isPhoto = background === "photo";

  return (
    <div className={`relative min-h-screen overflow-hidden ${isPhoto ? "" : "auth-gradient-bg"}`}>
      {isPhoto && (
        <>
          <div className="auth-photo-layer absolute inset-0" style={{ backgroundImage: `url(${loginBg})` }} />
          <div className="auth-photo-scrim absolute inset-0" />
        </>
      )}

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-16">
        <div className="hidden max-w-md lg:block">
          <BrandLogo className="w-56" variant="white" />
          <Title level={2} className="!mt-8 !text-white !tracking-tight">
            Run every job, lead, and shift from one place
          </Title>
          <Paragraph className="!mt-4 !text-base !text-white/70">
            Smartrays CMS keeps your team, customers, and field operations in sync — from the
            first lead to the last invoice.
          </Paragraph>
        </div>

        <div className="flex flex-col items-center lg:hidden">
          <BrandLogo className="w-36" variant="white" />
        </div>

        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/12 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10 lg:mr-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
