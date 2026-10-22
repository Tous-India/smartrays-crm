import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SCREENS } from "../constants/screens.constants";
import { ManagerTabs } from "./MainTabs";
import CaptureScreen from "../modules/attendance/screens/CaptureScreen";
import TrackingDisclosureScreen from "../modules/tracking/screens/TrackingDisclosureScreen";
import BatteryGuidanceScreen from "../modules/tracking/screens/BatteryGuidanceScreen";
import VisitPhotoScreen from "../modules/visits/screens/VisitPhotoScreen";

const Stack = createNativeStackNavigator();

/**
 * The manager's app (app-plan.md §2): everything the employee has, plus the
 * Team tab (ManagerTabs). The tab and its screens exist only here — an
 * employee's navigator never registers them, so there is no route for an
 * employee to reach; the server's own gates refuse the endpoints besides.
 */
function ManagerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={SCREENS.MAIN_TABS} component={ManagerTabs} />
      <Stack.Screen name={SCREENS.CAPTURE} component={CaptureScreen} />
      <Stack.Screen name={SCREENS.VISIT_PHOTO} component={VisitPhotoScreen} />
      <Stack.Screen name={SCREENS.TRACKING_DISCLOSURE} component={TrackingDisclosureScreen} />
      <Stack.Screen name={SCREENS.BATTERY_GUIDANCE} component={BatteryGuidanceScreen} />
    </Stack.Navigator>
  );
}

export default ManagerNavigator;
