/**
 * The web brand, as the auth pages render it (frontend/src/styles/index.css
 * `@theme` and the auth-panel notes in AuthLayout.jsx). Same hex values, so a
 * screen here and the login page there read as one product.
 */
export const colors = {
  brandNavy: "#163b78",
  brandGreen: "#1d8343",

  // The auth heading's gradient stops — near, mid, far.
  gradientNear: "#163b78",
  gradientMid: "#10607f",
  gradientFar: "#0d6e52",

  // Surfaces: the tinted brand panel, the near-white page, the raised card.
  brandPanel: "#f7f3ec",
  brandPanelAlt: "#ededed",
  page: "#fbfbfa",
  card: "#ffffff",
  border: "#c8c8c8",
  inputBorder: "#d9d9d9",

  // Text — Tailwind's slate-900 / slate-600 / slate-500, as the auth pages use.
  textPrimary: "#0f172a",
  textLabel: "#475569",
  textSecondary: "#64748b",
  textOnBrand: "#ffffff",

  // AntD's error alert palette.
  danger: "#dc2626",
  dangerBg: "#fff2f0",
  dangerBorder: "#ffccc7",

  disabled: "#94a3b8",
  disabledBg: "#e2e8f0",
};
