import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AuthLayout from "./AuthLayout";

/**
 * §7.60 — the two-panel opaque auth shell.
 *
 * jsdom cannot check any of the colours, the split, or the breakpoint at which
 * the brand panel collapses; that was verified by sampling painted pixels in a
 * real browser at 1920/1280/1024/390. What is worth pinning here is the
 * structure the redesign introduced and the API it deliberately dropped.
 */
describe("AuthLayout", () => {
  it("renders the brand panel copy alongside the form", () => {
    render(
      <AuthLayout>
        <button type="submit">Log in</button>
      </AuthLayout>
    );

    expect(
      screen.getByRole("heading", { name: /Run every job, lead, and shift from one place/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/© 2026 Smartrays Solutions/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });


  it("puts the brand gradient on the heading", () => {
    render(<AuthLayout>x</AuthLayout>);

    expect(
      screen.getByRole("heading", { name: /Run every job/ })
    ).toHaveClass("auth-gradient-heading");
  });

  /**
   * The one failure mode worth a test rather than a screenshot.
   *
   * `background-clip: text` is normally paired with
   * `-webkit-text-fill-color: transparent`. If the clip does not apply, the
   * fill stays transparent and the heading renders INVISIBLE. jsdom evaluates
   * neither `@supports` nor `background-clip`, so this asserts the shape of the
   * stylesheet itself: the solid navy is declared unconditionally, and the
   * transparent fill only ever appears inside a feature query.
   */
  it("declares the solid navy fallback before, and outside, the transparent fill", () => {
    // Resolved from the package root — `import.meta.url` is not a file: URL
    // under Vitest's transform.
    const css = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");

    const ruleStart = css.indexOf(".auth-gradient-heading {");
    const supportsStart = css.indexOf("@supports", ruleStart);
    const fillIndex = css.indexOf("-webkit-text-fill-color: transparent", ruleStart);

    expect(ruleStart).toBeGreaterThan(-1);
    expect(supportsStart).toBeGreaterThan(ruleStart);

    // The unconditional block carries the navy...
    const base = css.slice(ruleStart, supportsStart);
    expect(base).toMatch(/color:\s*#163b78/i);
    expect(base).not.toMatch(/text-fill-color/i);

    // ...and the transparent fill is inside the feature query, after it.
    expect(fillIndex).toBeGreaterThan(supportsStart);
  });


  /**
   * §7.62 — the font is deliberately narrow in scope and self-hosted. jsdom
   * loads no stylesheet, so these assert the stylesheet's own shape: one
   * @font-face, one weight, the vendored file (never a CDN), and a fallback
   * stack that ends where the rest of the app already is.
   */
  it("self-hosts exactly one Montserrat weight and never imports it from a CDN", () => {
    const raw = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");
    // Comments in this sheet discuss `@import` and CDNs by name; scanning them
    // would match the prose rather than the rules.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

    const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
    expect(faces).toHaveLength(1);
    expect(faces[0]).toMatch(/font-family:\s*"Montserrat"/);
    expect(faces[0]).toMatch(/font-weight:\s*700/);
    expect(faces[0]).toMatch(/font-display:\s*swap/);
    expect(faces[0]).toMatch(/url\("\.\.\/assets\/fonts\/montserrat-700-latin\.woff2"\)/);

    // No render-blocking third-party pull. The only @import in this sheet is
    // Tailwind's own, which is required and is not a network font fetch.
    const imports = css.match(/@import[^;]+;/g) || [];
    expect(imports).toEqual(['@import "tailwindcss";']);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\/[^)]*\.woff/);
  });

  it("applies Montserrat at 36px to the heading only, over the project stack", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");
    const rule = css.slice(
      css.indexOf(".auth-gradient-heading {"),
      css.indexOf("}", css.indexOf(".auth-gradient-heading {"))
    );

    expect(rule).toMatch(/font-size:\s*36px/);
    // Fallback tail is the app's own stack, so a font-load failure lands where
    // every other screen already is rather than on an unrelated family.
    expect(rule).toMatch(/font-family:\s*"Montserrat",\s*ui-sans-serif,\s*system-ui,\s*sans-serif/);
    // Scoped: the global stack is not touched anywhere in the sheet.
    expect(css).not.toMatch(/^\s*(body|html|:root)\s*\{[^}]*Montserrat/m);
  });


  it("carries a real list of what the CMS covers, not decorated markup", () => {
    render(<AuthLayout>x</AuthLayout>);

    // A <ul>, so it announces as a list; the separators are CSS ::before on
    // each item after the first, never sibling <li>s that would announce as
    // empty list items.
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);

    expect(items).toEqual([
      "Leads & Customers",
      "Attendance & Payroll",
      "Projects & Tickets",
    ]);
  });


  /**
   * §7.65 — the shell must be able to scroll. Suppressing the scrollbar would
   * put the submit button out of reach on a short window or with a mobile
   * keyboard open, which is worse than a scrollbar. jsdom applies no
   * stylesheet, so this asserts the sheet itself never contains the escape
   * hatches, and that the shell declares a 100vh fallback before 100dvh.
   */
  it("never suppresses the scrollbar on the auth shell, and falls back from dvh to vh", () => {
    const raw = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

    const start = css.indexOf(".auth-shell {");
    const rule = css.slice(start, css.indexOf("}", start));
    expect(start).toBeGreaterThan(-1);
    expect(rule.indexOf("100vh")).toBeGreaterThan(-1);
    expect(rule.indexOf("100dvh")).toBeGreaterThan(rule.indexOf("100vh"));
    expect(rule).not.toMatch(/overflow/);

    // The one place that does hide a scrollbar is the app sidebar, which is not
    // an auth surface; nothing auth-scoped may.
    const hidden = css.match(/[^}]*scrollbar-width:\s*none[^}]*\}/g) || [];
    hidden.forEach((block) => expect(block).toMatch(/app-sidebar-scroll/));
    const webkit = css.match(/[^{]*::-webkit-scrollbar[^{]*\{/g) || [];
    webkit.forEach((sel) => expect(sel).toMatch(/app-sidebar-scroll/));
  });

  it("takes no `background` prop — both of its surfaces were deleted", () => {
    // The prop used to select between "photo" and "gradient". Passing it now
    // must be inert rather than quietly selecting a surface that no longer
    // exists, so the two renders have to be identical.
    const { container: plain } = render(<AuthLayout>x</AuthLayout>);
    const { container: withProp } = render(<AuthLayout background="photo">x</AuthLayout>);

    expect(withProp.innerHTML).toBe(plain.innerHTML);
    expect(plain.querySelector(".auth-photo-layer, .auth-gradient-bg")).toBeNull();
  });
});
