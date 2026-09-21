import { useCallback } from "react";
import { StyleSheet, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Screen from "../../../components/Screen";
import PrimaryButton from "../../../components/PrimaryButton";
import TodayShiftCard from "../../attendance/components/TodayShiftCard";
import useMyAttendance from "../../attendance/hooks/useMyAttendance";
import useIsOnline from "../../../hooks/useIsOnline";
import useSessionStore from "../../../store/sessionStore";
import { signOut } from "../../auth/session.service";
import { CAPTURE_MODES, SCREENS } from "../../../constants/screens.constants";
import { spacing, typography } from "../../../theme";

/**
 * The signed-in landing screen — the shift card first (app-plan.md §1.1),
 * for employee and manager alike (a manager checks in too, §2). The card
 * re-reads the server every time this screen regains focus, which is how a
 * check-in made on the capture screen shows up here without the two
 * screens sharing state.
 */
function HomeScreen({ navigation }) {
  const user = useSessionStore((state) => state.user);
  const isOnline = useIsOnline();
  const attendance = useMyAttendance();
  const { refetch } = attendance;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <Screen testID="home-screen">
      <Text style={typography.title}>Hello, {user?.name}</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>Signed in as {user?.role}</Text>

      <TodayShiftCard
        openRecord={attendance.openRecord}
        todayRecord={attendance.todayRecord}
        isLoading={attendance.isLoading}
        error={attendance.error}
        isOnline={isOnline}
        onCheckIn={() => navigation.navigate(SCREENS.CAPTURE, { mode: CAPTURE_MODES.CHECK_IN })}
        onCheckOut={() => navigation.navigate(SCREENS.CAPTURE, { mode: CAPTURE_MODES.CHECK_OUT })}
      />

      <PrimaryButton title="Sign out" onPress={signOut} testID="home-sign-out" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.xl },
});

export default HomeScreen;
