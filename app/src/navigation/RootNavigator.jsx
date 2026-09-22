import { useEffect } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import useSessionStore, { SESSION_STATUS } from "../store/sessionStore";
import { ROLES } from "../constants/roles.constants";
import { restoreSession } from "../modules/auth/session.service";
import AuthNavigator from "./AuthNavigator";
import EmployeeNavigator from "./EmployeeNavigator";
import ManagerNavigator from "./ManagerNavigator";
import SplashScreen from "../modules/auth/screens/SplashScreen";
import UnsupportedRoleScreen from "../modules/auth/screens/UnsupportedRoleScreen";
import PushNotice from "../components/PushNotice";
import usePushMessages from "../modules/push/usePushMessages";
import { navigateForNotification } from "../modules/push/pushNavigation";

/**
 * Picks the navigator from the session store, and nothing else. The store is
 * written by session.service.js (launch restore, sign in, sign out) and by
 * the API client when a refresh fails — every route into "signed out" ends
 * up here without a screen having to navigate anywhere.
 *
 * Role → stack is the ONLY role logic in the app. What a role may do inside
 * its stack is the server's answer (`GET /users/me/permissions`), never a
 * copy of the matrix held here.
 *
 * `navigationRef` is how a tapped push notification navigates from outside
 * any screen (STEP 4); PushNotice is the in-app banner for one that arrived
 * while the app was open.
 */
export const navigationRef = createNavigationContainerRef();

function navigatorForRole(role) {
  if (role === ROLES.EMPLOYEE) {
    return <EmployeeNavigator />;
  }

  if (role === ROLES.MANAGER) {
    return <ManagerNavigator />;
  }

  return <UnsupportedRoleScreen />;
}

function RootNavigator() {
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);

  useEffect(() => {
    restoreSession();
  }, []);

  usePushMessages(navigationRef, status === SESSION_STATUS.SIGNED_IN);

  if (status === SESSION_STATUS.RESTORING) {
    return <SplashScreen />;
  }

  if (status === SESSION_STATUS.UNREACHABLE) {
    return <SplashScreen unreachable onRetry={restoreSession} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {status === SESSION_STATUS.SIGNED_IN ? navigatorForRole(user?.role) : <AuthNavigator />}
      {status === SESSION_STATUS.SIGNED_IN ? <PushNotice onOpen={(data) => navigateForNotification(navigationRef, data)} /> : null}
    </NavigationContainer>
  );
}

export default RootNavigator;
