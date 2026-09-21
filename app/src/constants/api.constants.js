/** Backend paths the app calls, relative to API_BASE_URL. */
export const API_PATHS = {
  MOBILE_LOGIN: "/auth/mobile/login",
  MOBILE_TWO_FACTOR_VERIFY: "/auth/mobile/2fa/verify",
  MOBILE_REFRESH: "/auth/mobile/refresh",
  MOBILE_LOGOUT: "/auth/mobile/logout",
  CURRENT_USER: "/auth/me",
  MY_ATTENDANCE: "/attendance/me",
  CHECK_IN: "/attendance/check-in",
  CHECK_OUT: "/attendance/check-out",
};

/** The header the trusted-device token travels in (the web uses a cookie). */
export const TRUSTED_DEVICE_HEADER = "X-Trusted-Device";

/** The server's positive "your credential is gone" code — the only 401 that means "go to login". */
export const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";
