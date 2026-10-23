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
  HEARTBEAT: "/attendance/heartbeat",
  LOCATION_CONFIG: "/location/config",
  LOCATION_PINGS: "/location/pings",
  LOCATION_CONSENT: "/location/consent",
  LOCATION_CONSENT_ME: "/location/consent/me",
  SERVICES: "/services",
  LEAVE: "/leave",
  LEAVE_REQUEST: "/leave/request",
  LEAVE_BALANCE: "/leave/balance",
  MY_TEAM: "/teams/mine",
  USER_DIRECTORY: "/users/dropdown",
  USERS: "/users",
  MY_PERMISSIONS: "/users/me/permissions",
  PAYROLL: "/payroll",
  TEAM_ATTENDANCE: "/attendance/team",
  LOCATION_LIVE: "/location/live",
  SERVICE_ASSIGNEES: "/services/assignees",
  PUSH_DEVICES: "/notifications/devices",
  // Customer complaints (2026-10-23) — the web's complaint endpoints.
  COMPLAINTS: "/complaints",
  // Verified site visits (2026-10-22).
  VISITS: "/visits",
};

/** The header the trusted-device token travels in (the web uses a cookie). */
export const TRUSTED_DEVICE_HEADER = "X-Trusted-Device";

/** The server's positive "your credential is gone" code — the only 401 that means "go to login". */
export const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";
