/**
 * Shared type treatments for the auth screens (Login, Forgot Password, Reset
 * Password) — one place so all three stay in sync.
 *
 * Replaces `FROSTED_INPUT_STYLE` (2026-08-13, §7.60). That export existed only
 * because the old glass card needed inline `backgroundColor`/`color` overrides
 * to beat AntD's own CSS-in-JS on a translucent dark surface. The panels are
 * opaque now, so AntD's default input styling is already correct and the
 * override would just be re-stating it.
 */

/** Small uppercase field label — "EMAIL", "PASSWORD". */
export const AUTH_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-slate-600";

/** Page heading ("Welcome back") and its sub-line. */
export const AUTH_TITLE_CLASS = "text-2xl font-semibold tracking-tight text-slate-900";
export const AUTH_SUBTITLE_CLASS = "mt-1.5 text-sm text-slate-500";

/** The muted link line under the form ("Forgot password?", "Back to login"). */
export const AUTH_LINK_CLASS = "text-sm text-slate-500 hover:text-brand-navy";
