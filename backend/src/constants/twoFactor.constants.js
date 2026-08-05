/**
 * Roles for which two-factor authentication is mandatory (§7.38).
 *
 * Deliberately its own module with ZERO imports. `authenticate.middleware.js`
 * needs this rule on every request, but importing it from
 * `twoFactor.service.js` dragged in `credentialEncryption.service.js` and
 * therefore `config/env.js`, which pulled env evaluation earlier in the
 * module graph. That silently broke unrelated suites whose `beforeAll` sets
 * `process.env` before `getTestApp()` first evaluates `env.js` — the
 * website-intake webhook tests began reading the real `.env` token instead of
 * their own override.
 *
 * Keeping the rule dependency-free means "who must have 2FA" still has
 * exactly one definition, without the middleware inheriting the crypto
 * module's import side effects.
 */
export const MANDATORY_2FA_ROLES = ["admin", "manager"];

export function isTwoFactorMandatory(role) {
  return MANDATORY_2FA_ROLES.includes(role);
}
