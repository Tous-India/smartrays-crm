import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@react-native-vector-icons/ionicons";
import { SCREENS } from "../constants/screens.constants";
import HomeScreen from "../modules/home/screens/HomeScreen";
import ServicesScreen from "../modules/services/screens/ServicesScreen";
import ServiceDetailScreen from "../modules/services/screens/ServiceDetailScreen";
import LeaveScreen from "../modules/leave/screens/LeaveScreen";
import ApplyLeaveScreen from "../modules/leave/screens/ApplyLeaveScreen";
import MeScreen from "../modules/me/screens/MeScreen";
import AttendanceHistoryScreen from "../modules/me/screens/AttendanceHistoryScreen";
import PayslipsScreen from "../modules/me/screens/PayslipsScreen";
import { colors } from "../theme";

/**
 * The signed-in app's bottom tabs — Home · Services · Leave · Me — for the
 * employee and the manager alike (app-plan.md §3.1; a manager checks in,
 * has services and takes leave exactly as an employee does). Each tab that
 * drills down owns a small stack, so Back inside a tab never leaves it.
 * Full-screen flows that must hide the bar (the camera, the disclosure)
 * live in the role navigator above this one.
 */
const Tab = createBottomTabNavigator();
const ServicesStack = createNativeStackNavigator();
const LeaveStack = createNativeStackNavigator();
const MeStack = createNativeStackNavigator();

const NO_HEADER = { headerShown: false };

function ServicesTab() {
  return (
    <ServicesStack.Navigator screenOptions={NO_HEADER}>
      <ServicesStack.Screen name={SCREENS.SERVICES} component={ServicesScreen} />
      <ServicesStack.Screen name={SCREENS.SERVICE_DETAIL} component={ServiceDetailScreen} />
    </ServicesStack.Navigator>
  );
}

function LeaveTab() {
  return (
    <LeaveStack.Navigator screenOptions={NO_HEADER}>
      <LeaveStack.Screen name={SCREENS.LEAVE} component={LeaveScreen} />
      <LeaveStack.Screen name={SCREENS.APPLY_LEAVE} component={ApplyLeaveScreen} />
    </LeaveStack.Navigator>
  );
}

function MeTab() {
  return (
    <MeStack.Navigator screenOptions={NO_HEADER}>
      <MeStack.Screen name={SCREENS.ME} component={MeScreen} />
      <MeStack.Screen name={SCREENS.ATTENDANCE_HISTORY} component={AttendanceHistoryScreen} />
      <MeStack.Screen name={SCREENS.PAYSLIPS} component={PayslipsScreen} />
    </MeStack.Navigator>
  );
}

const TAB_ICONS = {
  [SCREENS.HOME]: ["home", "home-outline"],
  [SCREENS.SERVICES_TAB]: ["briefcase", "briefcase-outline"],
  [SCREENS.LEAVE_TAB]: ["calendar", "calendar-outline"],
  [SCREENS.ME_TAB]: ["person", "person-outline"],
};

function tabIcon(routeName) {
  return ({ focused, color, size }) => {
    const [active, inactive] = TAB_ICONS[routeName];

    return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
  };
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: tabIcon(route.name),
        tabBarActiveTintColor: colors.brandNavy,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        // Each tab is its own stack; leaving and returning shows it where it was.
        popToTopOnBlur: false,
      })}
    >
      <Tab.Screen name={SCREENS.HOME} component={HomeScreen} options={{ title: "Home", tabBarTestID: "tab-home" }} />
      <Tab.Screen name={SCREENS.SERVICES_TAB} component={ServicesTab} options={{ title: "Services", tabBarTestID: "tab-services" }} />
      <Tab.Screen name={SCREENS.LEAVE_TAB} component={LeaveTab} options={{ title: "Leave", tabBarTestID: "tab-leave" }} />
      <Tab.Screen name={SCREENS.ME_TAB} component={MeTab} options={{ title: "Me", tabBarTestID: "tab-me" }} />
    </Tab.Navigator>
  );
}

export default MainTabs;
