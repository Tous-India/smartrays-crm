import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SCREENS } from "../constants/screens.constants";
import MainTabs from "./MainTabs";
import CaptureScreen from "../modules/attendance/screens/CaptureScreen";
import TrackingDisclosureScreen from "../modules/tracking/screens/TrackingDisclosureScreen";
import BatteryGuidanceScreen from "../modules/tracking/screens/BatteryGuidanceScreen";

const Stack = createNativeStackNavigator();

/**
 * The manager's app (app-plan.md §2): everything the employee has — the same
 * MainTabs — plus, later, the Team tab. Same shape as EmployeeNavigator
 * today; they diverge as the team screens land, which is why they are two
 * files from the start.
 */
function ManagerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={SCREENS.MAIN_TABS} component={MainTabs} />
      <Stack.Screen name={SCREENS.CAPTURE} component={CaptureScreen} />
      <Stack.Screen name={SCREENS.TRACKING_DISCLOSURE} component={TrackingDisclosureScreen} />
      <Stack.Screen name={SCREENS.BATTERY_GUIDANCE} component={BatteryGuidanceScreen} />
    </Stack.Navigator>
  );
}

export default ManagerNavigator;
