import BrandLogo from "./BrandLogo";

/**
 * Shared shell for every public auth screen (login, forgot-password,
 * reset-password) — two opaque panels, both LIGHT since §7.61 (2026-08-13).
 *
 * The split and the responsive behaviour are unchanged from §7.60; only the
 * surfaces and their treatment moved. The brand panel was solid navy with a
 * white monochrome logo; it is now a warm off-white carrying the original
 * full-colour mark.
 *
 * TWO NEAR-WHITES CANNOT SEPARATE THEMSELVES. `#ededed` against `#ffffff` is
 * 1.28:1 — below anything the eye reliably reads as an edge, and #ededed is a
 * NEUTRAL grey, so there is no longer even a hue difference doing quiet work
 * the way the previous warm off-white did. The hairline divider is therefore
 * the only thing separating the two panels, which makes it structural rather
 * than decorative: remove it and the split stops reading as a split.
 *
 * LEFT — brand, `#f7f3ec`. Desktop only: below `lg` it would either squeeze the
 * form into an unreadable column or push it off-screen, so it collapses to a
 * compact logo-only header instead of scaling down.
 *
 * RIGHT — pure white, with the form itself raised on a soft wide shadow. On a
 * white-on-white pairing the shadow is the ONLY thing defining the card, which
 * is why it is wide and low-opacity rather than tight and dark — a hard drop
 * shadow at this size reads as a border, not as elevation.
 */
function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Compact brand header — below `lg` only. Logo and wordmark, nothing else. */}
      <header className="flex items-center justify-center border-b border-[#c8c8c8] bg-[#ededed] px-6 py-7 lg:hidden">
        <BrandLogo className="w-36" variant="color" layout="horizontal" />
      </header>

      {/* `lg:border-r` is the hairline divider — see the note above on why the
          tone difference alone is not enough to separate the two panels. */}
      <aside className="hidden bg-[#ededed] px-12 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:border-r lg:border-[#c8c8c8] xl:px-16 xl:py-14">
        <BrandLogo className="w-44" variant="color" layout="horizontal" />

        <div className="max-w-xl">
          {/* Accent rule — the same ramp as the heading, so the two read as one
              gesture rather than a bar that happens to sit above a title. */}
          <div className="mb-7 h-1 w-12 rounded-full bg-[linear-gradient(100deg,#163b78_0%,#0d6e52_100%)]" />
          <h1 className="auth-gradient-heading font-bold tracking-tight">
            Run every job, lead, and shift from one place
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
            Smartrays CMS keeps your team, customers, and field operations in sync — from the
            first lead to the last invoice.
          </p>
        </div>

        <p className="text-sm text-slate-600">© 2026 Smartrays Solutions. All rights reserved.</p>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-white px-6 py-14 sm:px-10 lg:w-1/2">
        <div className="w-full max-w-[380px] rounded border bg-white p-8 shadow-[0_24px_64px_-20px_rgba(15,23,42,0.20),0_8px_24px_-12px_rgba(15,23,42,0.10)] sm:p-9">
          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
