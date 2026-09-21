import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SCREENS } from "../constants/screens.constants";
import HomeScreen from "../modules/home/screens/HomeScreen";

const Stack = createNativeStackNavigator();

/**
 * The manager's app (app-plan.md §2): everything the employee has, plus the
 * Team tab. Same shape as EmployeeNavigator today; they diverge as the team
 * screens land, which is why they are two files from the start.
 */
function ManagerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={SCREENS.HOME} component={HomeScreen} />
    </Stack.Navigator>
  );
}

export default ManagerNavigator;
