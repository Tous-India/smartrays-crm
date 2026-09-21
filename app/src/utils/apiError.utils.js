import { SESSION_EXPIRED_CODE } from "../constants/api.constants";

/**
 * The message a screen shows for a failed request: the backend's own
 * `message` when there is one (validation text, "Invalid email or password",
 * the 2FA lockout), a plain network line when the server was never reached,
 * and a generic fallback otherwise. Backend messages are never swallowed.
 */
export function messageFromError(error, fallback = "Something went wrong. Please try again.") {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.request && !error.response) {
    return "Could not reach the server. Check your connection and try again.";
  }

  return error?.message || fallback;
}

/** True when the server answered at all (as opposed to a network failure). */
export function hasServerResponse(error) {
  return Boolean(error?.response);
}

export function isSessionExpired(error) {
  const errors = error?.response?.data?.errors;

  return Array.isArray(errors) && errors.some((entry) => entry?.code === SESSION_EXPIRED_CODE);
}
