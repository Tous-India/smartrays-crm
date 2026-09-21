import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Whether the device currently has a usable network path. Drives the
 * "button visible, disabled, with the reason" rule for every server-side
 * state change (app-plan.md §3.3): a control that vanishes offline leaves
 * the user wondering what they did wrong.
 *
 * `isInternetReachable` is null while NetInfo is still probing; only an
 * explicit false counts as offline, so a slow probe never disables anything.
 */
function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });

    return unsubscribe;
  }, []);

  return isOnline;
}

export default useIsOnline;
