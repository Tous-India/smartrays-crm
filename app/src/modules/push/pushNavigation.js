import { SCREENS } from "../../constants/screens.constants";

/**
 * Where a tapped notification lands (STEP 4). The `data` envelope is the
 * backend's push.service.js#fcmData: `type`, and the related entity's
 * `module` and `id`. Every route here is inside MainTabs, so the target is
 * the tab plus, when the tab holds a stack, the screen in it. Unknown types
 * go Home — a tap must always land somewhere.
 */
export function routeForNotification(data = {}) {
  const { type, id } = data;

  if (type === "service_assigned" && id) {
    return { name: SCREENS.SERVICES_TAB, params: { screen: SCREENS.SERVICE_DETAIL, params: { serviceId: id }, initial: false } };
  }

  if (type === "service_assigned") {
    return { name: SCREENS.SERVICES_TAB };
  }

  // Customer complaints (2026-10-23): new, assigned to me, an update, a
  // send-back or a reminder → that complaint; the daily summary → the list.
  if (type && String(type).startsWith("complaint_") && type !== "complaint_daily_summary" && id) {
    return { name: SCREENS.SERVICES_TAB, params: { screen: SCREENS.COMPLAINT_DETAIL, params: { ticketId: id }, initial: false } };
  }

  if (type && String(type).startsWith("complaint_")) {
    return { name: SCREENS.SERVICES_TAB, params: { screen: SCREENS.COMPLAINTS, initial: false } };
  }

  // Live status (2026-10-23): someone's location is off / disconnected →
  // the Team tab's Live list, filtered to who needs attention.
  if (type === "staff_location_alert") {
    return { name: SCREENS.TEAM_TAB, params: { screen: SCREENS.TEAM, params: { segment: "live", filter: "attention", openedAt: Date.now() } } };
  }

  if (typeof type === "string" && type.startsWith("leave_")) {
    return { name: SCREENS.LEAVE_TAB };
  }

  return { name: SCREENS.HOME };
}

/**
 * The same target as seen from ABOVE the tabs — the root navigator, or a
 * screen in the role stack such as Notifications (2026-10-23). React
 * Navigation only handles a tab name from inside the tabs; from up here it
 * has to go through MainTabs, or the tap does nothing.
 */
export function rootRouteForNotification(data = {}) {
  const target = routeForNotification(data);

  return { name: SCREENS.MAIN_TABS, params: { screen: target.name, params: target.params } };
}

/**
 * Navigates the given container ref to the notification's screen, when the
 * container is ready. A quit-state tap arrives before the navigator has
 * mounted; the caller retries then.
 */
export function navigateForNotification(navigationRef, data) {
  if (!navigationRef?.isReady?.()) {
    return false;
  }

  const target = rootRouteForNotification(data);
  navigationRef.navigate(target.name, target.params);

  return true;
}
