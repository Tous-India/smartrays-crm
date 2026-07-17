/**
 * Shared frosted-dark input treatment for every auth screen's form fields
 * (Login, Forgot Password, Reset Password) — one place so all three stay in
 * sync. Inline styles because AntD's own CSS-in-JS background/border/color
 * rules otherwise win on specificity over Tailwind classes; paired with the
 * `.auth-frosted-input` class (index.css) for the placeholder/icon colors
 * inline styles can't reach.
 */
export const FROSTED_INPUT_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  borderColor: "rgba(255, 255, 255, 0.2)",
  color: "#f5f7fb",
};
