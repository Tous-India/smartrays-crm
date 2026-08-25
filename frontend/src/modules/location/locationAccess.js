import { can } from "../../utils/permission.utils";

/**
 * The ONE gate for every map surface (§7.67).
 *
 * There were two, and they disagreed. The Live Map tab was gated on
 * `attendance.view_location` while `GET /location/live` and
 * `GET /location/history` are gated on `location.[view|view_team|view_all]`.
 * A default manager holds `location.view_team` but NOT
 * `attendance.view_location`, so the tab was hidden from someone the API would
 * happily serve — confirmed against the real account, which got HTTP 200 with
 * their direct report's position while the tab was absent.
 *
 * Mirroring `authorizeAny("location", VIEW_ACTIONS)` — the middleware the
 * routes actually use — means the UI now hides exactly what the API refuses,
 * and nothing else. Hiding the tab stays a courtesy; the 403/404 from the
 * server remains the guarantee.
 */
export const LOCATION_VIEW_ACTIONS = ["view", "view_team", "view_all"];

export function canViewLocationMaps(user) {
  return LOCATION_VIEW_ACTIONS.some((action) => can(user, "location", action));
}

/**
 * Whether this viewer can ever see somebody OTHER than themselves. `view`
 * alone is the own-data tier, so an employee gets a map of their own history
 * and no Everyone mode at all.
 */
export function canViewOtherPeoplesLocation(user) {
  return can(user, "location", "view_team") || can(user, "location", "view_all");
}

export default canViewLocationMaps;
