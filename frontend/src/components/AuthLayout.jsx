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
    <div className="auth-shell flex flex-col lg:flex-row">
      {/* Compact brand header — below `lg` only. Logo and wordmark, nothing else. */}
      <header className="flex items-center justify-center border-b border-[#c8c8c8] bg-[#ededed] px-6 py-7 lg:hidden">
        <BrandLogo className="w-36" variant="color" layout="horizontal" />
      </header>

      {/*
        TOP-ALIGNED, not centred (§7.64). Both panels start their content at the
        same offset, so the logo's top edge and the card's top edge sit on one
        line. Centring — which this was — makes that line drift with content
        height, and the drift is worst exactly where it shows: Forgot Password
        and Reset Password have much shorter forms, so a centred card floated to
        a different height on every auth screen.

        `lg:border-r` is the hairline divider; see the note above on why the tone
        difference alone cannot separate the two panels.
      */}
      <aside className="hidden bg-[#ededed] px-12 pb-10 pt-20 lg:pt-[18vh] lg:flex lg:w-1/2 lg:flex-col lg:justify-start lg:border-r lg:border-[#c8c8c8] xl:px-16">
        <BrandLogo className="w-44" variant="color" layout="horizontal" />

        {/* 40px below the logo — close enough to read as the same block.
            `max-w-md`: at 576px (and still at 512px) the heading wrapped well
            before the column edge, leaving ~82px of dead measure to its right so
            the column edge did not agree with the text edge. 448px puts the edge
            just past the longest line without forcing a third line. */}
        <div className="mt-10 max-w-md">
          {/* Accent rule — the same ramp as the heading, so the two read as one
              gesture rather than a bar that happens to sit above a title. 16px
              below it keeps that reading; more and the rule floats free. */}
          <div className="mb-4 h-1 w-12 rounded-full bg-[linear-gradient(100deg,#163b78_0%,#0d6e52_100%)]" />
          <h1 className="auth-gradient-heading font-bold tracking-tight">
            Run every job, lead, and shift from one place
          </h1>
          {/* 12px — heading and sub-line are one tight group. `!` because AntD's
              global reset zeroes `p` margin-top and adds `margin-bottom: 1em`,
              which silently ate this gap and the footer's until it was measured. */}
          <p className="!mt-3 !mb-0 max-w-md text-xs leading-relaxed text-slate-900">
            Smartrays CMS keeps your team, customers, and field operations in sync — from the
            first lead to the last invoice.
          </p>

          {/*
            The connective tissue between the heading group and the footer — what
            the CMS actually covers, in one compact line.

            A real <ul>, so it reads as a list to assistive tech; the separators
            are CSS `::before` on every item after the first rather than markup,
            because a middot as a sibling <li> would announce as a list item.
            Deliberately no icons, cards or badges — the panel's restraint is the
            point, and three short phrases carry it.

            slate-900 at 12px, matching the sub-line: §7.63 measured that at this
            size anything lighter fails 4.5:1 on PAINTED contrast once
            antialiasing is accounted for, however muted it looks declared.
          */}
          <ul className="!mt-4 !mb-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 !p-0 text-xs text-slate-900 [&>li+li]:before:mr-2 [&>li+li]:before:text-slate-400 [&>li+li]:before:content-['·']">
            <li>Leads &amp; Customers</li>
            <li>Attendance &amp; Payroll</li>
            <li>Projects &amp; Tickets</li>
          </ul>
        </div>

        {/* 48px below the group. Enough to read as a separate register, far less
            than the full-height gap it replaces. */}
        <p className="!mt-12 !mb-0 text-xs text-slate-900">© 2026 Smartrays Solutions. All rights reserved.</p>
      </aside>

      {/*
        Panel tinted #fbfbfa so a pure #ffffff card reads as raised against it.
        The card previously carried BOTH a 1px border and a shadow on a white
        panel — two treatments doing the same job, neither committing, and the
        border was the only thing actually separating card from panel. The tint
        gives the shadow a ground to fall on, so the border is gone.

        `lg:items-start` + the same `pt-24` as the aside is what puts the card's
        top edge on the logo's.
      */}
      <main className="flex flex-1 items-center justify-center bg-[#fbfbfa] px-6 py-14 sm:px-10 lg:w-1/2 lg:items-start lg:pb-10 lg:pt-[18vh]">
        <div className="w-full max-w-[420px] rounded-xl bg-white p-6 shadow-[0_24px_64px_-20px_rgba(15,23,42,0.20),0_8px_24px_-12px_rgba(15,23,42,0.10)] sm:p-7">
          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
