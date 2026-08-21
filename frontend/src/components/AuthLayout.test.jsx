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
