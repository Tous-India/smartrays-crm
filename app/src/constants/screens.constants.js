/** Screen names — the one place a navigate() target is spelled out. */
export const SCREENS = {
  LOGIN: "Login",
  TWO_FACTOR: "TwoFactor",
  // The signed-in root: the tab bar, and the full-screen flows above it.
  MAIN_TABS: "MainTabs",
  CAPTURE: "Capture",
  // Site photo for a verified visit (2026-10-22) — full screen, like Capture.
  VISIT_PHOTO: "VisitPhoto",
  // A live-camera photo for a complaint (2026-10-23) — full screen too.
  COMPLAINT_PHOTO: "ComplaintPhoto",
  TRACKING_DISCLOSURE: "TrackingDisclosure",
  BATTERY_GUIDANCE: "BatteryGuidance",
  UNSUPPORTED_ROLE: "UnsupportedRole",
  // The tabs, and the screens inside each tab's own stack.
  HOME: "Home",
  SERVICES_TAB: "ServicesTab",
  SERVICES: "Services",
  SERVICE_DETAIL: "ServiceDetail",
  // Customer complaints (2026-10-22) — inside the Services (work) tab.
  COMPLAINTS: "Complaints",
  COMPLAINT_DETAIL: "ComplaintDetail",
  ASSIGN_COMPLAINT: "AssignComplaint",
  LEAVE_TAB: "LeaveTab",
  LEAVE: "Leave",
  APPLY_LEAVE: "ApplyLeave",
  ME_TAB: "MeTab",
  ME: "Me",
  ATTENDANCE_HISTORY: "AttendanceHistory",
  PAYSLIPS: "Payslips",
  // The manager's Team tab (app-plan.md §2) and the screens inside it.
  TEAM_TAB: "TeamTab",
  TEAM: "Team",
  TEAM_MEMBER_DAY: "TeamMemberDay",
  // A person's live status and their day as a timeline (2026-10-23).
  PERSON_DAY: "PersonDay",
  TEAM_SERVICE_DETAIL: "TeamServiceDetail",
  SERVICE_FORM: "ServiceForm",
};

/** What the capture screen is for — its `mode` route param. */
export const CAPTURE_MODES = {
  CHECK_IN: "check-in",
  CHECK_OUT: "check-out",
};
