/** The same email test the backend's validators use (auth.validation.js). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Client-side checks for the sign-in form — the ones the server would make
 * anyway, run first so an empty field never costs a round trip. Returns a
 * map of field → message; empty when the form may be submitted.
 */
export function validateLoginForm({ email, password }) {
  const errors = {};

  if (!email || !email.trim()) {
    errors.email = "Email is required";
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "Enter a valid email address";
  }

  if (!password) {
    errors.password = "Password is required";
  }

  return errors;
}

/** A TOTP code is six digits; a recovery code is longer. Either way, not empty. */
export function validateTwoFactorForm({ token }) {
  const errors = {};

  if (!token || !token.trim()) {
    errors.token = "Enter the code from your authenticator app, or a recovery code";
  }

  return errors;
}
