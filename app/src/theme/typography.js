import { colors } from "./colors";

/**
 * Type scale matching frontend/src/constants/authStyles.constants.js:
 * title text-2xl semibold, subtitle text-sm slate-500, labels text-xs
 * uppercase semibold tracking-wider slate-600. Montserrat (the web's brand
 * heading) is not bundled yet; the system font carries the same weights.
 */
export const typography = {
  title: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: colors.textLabel,
  },
  body: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  small: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  button: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textOnBrand,
  },
};
