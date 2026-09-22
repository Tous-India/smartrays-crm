import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SCREENS } from "../constants/screens.constants";
import { EmployeeTabs } from "./MainTabs";
import CaptureScreen from "../modules/attendance/screens/CaptureScreen";
import TrackingDisclosureScreen from "../modules/tracking/screens/TrackingDisclosureScreen";
import BatteryGuidanceScreen from "../modules/tracking/screens/BatteryGuidanceScreen";

const Stack = createNativeStackNavigator();

/**
 * The employee's app (app-plan.md §1): the bottom tabs (MainTabs), and above
 * them the full-screen flows that must hide the tab bar — the camera, the
 * tracking disclosure, the battery guidance.
 */
function EmployeeNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={SCREENS.MAIN_TABS} component={EmployeeTabs} />
      <Stack.Screen name={SCREENS.CAPTURE} component={CaptureScreen} />
      <Stack.Screen name={SCREENS.TRACKING_DISCLOSURE} component={TrackingDisclosureScreen} />
      <Stack.Screen name={SCREENS.BATTERY_GUIDANCE} component={BatteryGuidanceScreen} />
    </Stack.Navigator>
  );
}

export default EmployeeNavigator;
