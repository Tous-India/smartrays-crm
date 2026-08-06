/**
 * Mirrors `backend/src/constants/twoFactor.constants.js` — 2FA is mandatory
 * for these roles. UI convenience only: the backend enforces it on every
 * request, and this just decides whether to label it "Required for your role".
 */
export const MANDATORY_2FA_ROLES = ["admin", "manager"];

export function isTwoFactorMandatory(role) {
  return MANDATORY_2FA_ROLES.includes(role);
}
