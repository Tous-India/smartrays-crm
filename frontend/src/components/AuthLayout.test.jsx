import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
