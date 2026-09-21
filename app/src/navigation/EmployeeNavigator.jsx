import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SCREENS } from "../constants/screens.constants";
import HomeScreen from "../modules/home/screens/HomeScreen";
import CaptureScreen from "../modules/attendance/screens/CaptureScreen";
import TrackingDisclosureScreen from "../modules/tracking/screens/TrackingDisclosureScreen";
import BatteryGuidanceScreen from "../modules/tracking/screens/BatteryGuidanceScreen";

const Stack = createNativeStackNavigator();

/**
 * The employee's app (app-plan.md §1). Bottom tabs (Home · Tasks · Leave ·
 * More) arrive with the screens that fill them; a stack holds Home until then.
 */
function EmployeeNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={SCREENS.HOME} component={HomeScreen} />
      <Stack.Screen name={SCREENS.CAPTURE} component={CaptureScreen} />
      <Stack.Screen name={SCREENS.TRACKING_DISCLOSURE} component={TrackingDisclosureScreen} />
      <Stack.Screen name={SCREENS.BATTERY_GUIDANCE} component={BatteryGuidanceScreen} />
    </Stack.Navigator>
  );
}

export default EmployeeNavigator;
