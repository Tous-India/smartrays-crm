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

  if (typeof type === "string" && type.startsWith("leave_")) {
    return { name: SCREENS.LEAVE_TAB };
  }

  return { name: SCREENS.HOME };
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

  const target = routeForNotification(data);
  navigationRef.navigate(target.name, target.params);

  return true;
}
