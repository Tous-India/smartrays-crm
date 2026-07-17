import { Typography } from "antd";
import BrandLogo from "./BrandLogo";

const { Title, Paragraph } = Typography;

/**
 * Shared shell for every public auth screen (login, forgot-password,
 * reset-password) — the dark navy background + green glow + vignette
 * (`.auth-gradient-bg`, index.css) and the floating dark glass card are
 * identical across all three; only the card's contents differ per page.
 * Extracted here once a third screen needed the exact same treatment,
 * rather than duplicating the background/card markup a third time.
 */
function AuthLayout({ children }) {
  return (
    <div className="auth-gradient-bg relative min-h-screen overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-16">
        <div className="hidden max-w-md lg:block">
          <BrandLogo className="w-56" />
          <Title level={2} className="!mt-8 !text-white !tracking-tight">
            Run every job, lead, and shift from one place
          </Title>
          <Paragraph className="!mt-4 !text-base !text-white/70">
            Smartrays CMS keeps your team, customers, and field operations in sync — from the
            first lead to the last invoice.
          </Paragraph>
        </div>

        <div className="flex flex-col items-center lg:hidden">
          <BrandLogo className="w-36" />
        </div>

        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/12 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10 lg:mr-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
