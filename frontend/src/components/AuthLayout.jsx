import BrandLogo from "./BrandLogo";

/**
 * Shared shell for every public auth screen (login, forgot-password,
 * reset-password) — a two-panel split, both panels fully OPAQUE.
 *
 * Replaces the floating dark-glass card (2026-08-13, §7.60). That card sat on
 * a blurred photograph behind `backdrop-blur-xl` at `bg-white/12`, which made
 * every foreground colour a composite of the photo underneath — the reason the
 * submit button could vanish entirely mid-submit (§7.59) and the reason
 * contrast could only ever be verified by sampling painted pixels. Opaque
 * panels make the surface a known quantity again.
 *
 * There is deliberately **no `background` prop** any more. It used to pick
 * between `"photo"` (login) and `"gradient"` (the other two), and both of those
 * surfaces are gone; leaving the prop would leave three call sites choosing
 * between options that no longer exist.
 *
 * LEFT — brand, solid `--color-brand-navy`. Desktop only: below `lg` it would
 * either squeeze the form into an unreadable column or push it off-screen, so
 * it collapses to a compact logo-only header instead of scaling down.
 *
 * RIGHT — the form, on a light neutral. Vertically centred, contents
 * left-aligned, capped at 380px so the fields stay a comfortable measure no
 * matter how wide the panel gets at 1920.
 *
 * The logo is the white HORIZONTAL mark in both panels. On the old layout the
 * stacked white-shadow asset was needed because the mark sat directly on a
 * photo whose brightness varied; against flat navy the plain silhouette is
 * enough, and a wordmark reads better as a top-left brand mark than a tall
 * stacked one.
 */
function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Compact brand header — below `lg` only. Logo and wordmark, nothing else. */}
      <header className="flex items-center justify-center bg-brand-navy px-6 py-7 lg:hidden">
        <BrandLogo className="w-36" variant="white" layout="horizontal" />
      </header>

      <aside className="hidden bg-brand-navy px-12 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-between xl:px-16 xl:py-14">
        <BrandLogo className="w-44" variant="white" layout="horizontal" />

        <div className="max-w-xl">
          {/* Short accent rule above the heading. */}
          <div className="mb-7 h-1 w-12 rounded-full bg-white/45" />
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-white xl:text-5xl">
            Run every job, lead, and shift from one place
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">
            Smartrays CMS keeps your team, customers, and field operations in sync — from the
            first lead to the last invoice.
          </p>
        </div>

        <p className="text-sm text-white/40">© 2026 Smartrays Solutions. All rights reserved.</p>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-[#f6f7f9] px-6 py-14 sm:px-10 lg:w-1/2">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}

export default AuthLayout;
