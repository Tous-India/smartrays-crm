import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@react-native-vector-icons/ionicons";
import { SCREENS } from "../constants/screens.constants";
import HomeScreen from "../modules/home/screens/HomeScreen";
import ServicesScreen from "../modules/services/screens/ServicesScreen";
import ServiceDetailScreen from "../modules/services/screens/ServiceDetailScreen";
import ComplaintsScreen from "../modules/complaints/screens/ComplaintsScreen";
import ComplaintDetailScreen from "../modules/complaints/screens/ComplaintDetailScreen";
import AssignComplaintScreen from "../modules/complaints/screens/AssignComplaintScreen";
import LeaveScreen from "../modules/leave/screens/LeaveScreen";
import ApplyLeaveScreen from "../modules/leave/screens/ApplyLeaveScreen";
import MeScreen from "../modules/me/screens/MeScreen";
import AttendanceHistoryScreen from "../modules/me/screens/AttendanceHistoryScreen";
import PayslipsScreen from "../modules/me/screens/PayslipsScreen";
import TeamScreen from "../modules/team/screens/TeamScreen";
import TeamMemberDayScreen from "../modules/team/screens/TeamMemberDayScreen";
import ServiceFormScreen from "../modules/team/screens/ServiceFormScreen";
import PersonDayScreen from "../modules/live/screens/PersonDayScreen";
import { colors } from "../theme";

/**
 * The signed-in app's bottom tabs — Home · Services · Leave · Me for the
 * employee, with Team between Services and Leave for the manager
 * (app-plan.md §3.1; a manager checks in, has services and takes leave
 * exactly as an employee does). Each tab that drills down owns a small
 * stack, so Back inside a tab never leaves it. Full-screen flows that must
 * hide the bar (the camera, the disclosure) live in the role navigator
 * above this one. The Team tab and its screens are registered ONLY in the
 * manager's tabs: an employee has no route to them at all.
 */
const Tab = createBottomTabNavigator();
const ServicesStack = createNativeStackNavigator();
const TeamStack = createNativeStackNavigator();
const LeaveStack = createNativeStackNavigator();
const MeStack = createNativeStackNavigator();

const NO_HEADER = { headerShown: false };

function ServicesTab() {
  return (
    <ServicesStack.Navigator screenOptions={NO_HEADER}>
      <ServicesStack.Screen name={SCREENS.SERVICES} component={ServicesScreen} />
      <ServicesStack.Screen name={SCREENS.SERVICE_DETAIL} component={ServiceDetailScreen} />
      <ServicesStack.Screen name={SCREENS.COMPLAINTS} component={ComplaintsScreen} />
      <ServicesStack.Screen name={SCREENS.COMPLAINT_DETAIL} component={ComplaintDetailScreen} />
      <ServicesStack.Screen name={SCREENS.ASSIGN_COMPLAINT} component={AssignComplaintScreen} />
    </ServicesStack.Navigator>
  );
}

function TeamTab() {
  return (
    <TeamStack.Navigator screenOptions={NO_HEADER}>
      <TeamStack.Screen name={SCREENS.TEAM} component={TeamScreen} />
      <TeamStack.Screen name={SCREENS.TEAM_MEMBER_DAY} component={TeamMemberDayScreen} />
      <TeamStack.Screen name={SCREENS.PERSON_DAY} component={PersonDayScreen} />
      <TeamStack.Screen name={SCREENS.TEAM_SERVICE_DETAIL} component={ServiceDetailScreen} />
      <TeamStack.Screen name={SCREENS.SERVICE_FORM} component={ServiceFormScreen} />
    </TeamStack.Navigator>
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
  [SCREENS.TEAM_TAB]: ["people", "people-outline"],
  [SCREENS.LEAVE_TAB]: ["calendar", "calendar-outline"],
  [SCREENS.ME_TAB]: ["person", "person-outline"],
};

function tabIcon(routeName) {
  return ({ focused, color, size }) => {
    const [active, inactive] = TAB_ICONS[routeName];

    return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
  };
}

function MainTabs({ withTeam = false }) {
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
      {withTeam ? <Tab.Screen name={SCREENS.TEAM_TAB} component={TeamTab} options={{ title: "Team", tabBarTestID: "tab-team" }} /> : null}
      <Tab.Screen name={SCREENS.LEAVE_TAB} component={LeaveTab} options={{ title: "Leave", tabBarTestID: "tab-leave" }} />
      <Tab.Screen name={SCREENS.ME_TAB} component={MeTab} options={{ title: "Me", tabBarTestID: "tab-me" }} />
    </Tab.Navigator>
  );
}

/** The employee's tabs. */
export function EmployeeTabs() {
  return <MainTabs />;
}

/** The manager's tabs: the same, plus Team. */
export function ManagerTabs() {
  return <MainTabs withTeam />;
}

export default MainTabs;
