import { useCallback, useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Screen from "../../../components/Screen";
import TodayShiftCard from "../../attendance/components/TodayShiftCard";
import ServicesDueCard from "../components/ServicesDueCard";
import useMyAttendance from "../../attendance/hooks/useMyAttendance";
import useIsOnline from "../../../hooks/useIsOnline";
import useServerData from "../../../hooks/useServerData";
import useSessionStore from "../../../store/sessionStore";
import { listServices } from "../../services/api/serviceApi";
import { SERVICE_STATUS } from "../../services/services.utils";
import useTrackingLifecycle from "../../tracking/hooks/useTrackingLifecycle";
import { getDisclosureAnswer } from "../../tracking/tracking.service";
import { getOemGuidance } from "../../tracking/oem.utils";
import * as tracking from "../../tracking/trackingAdapter";
import { CAPTURE_MODES, SCREENS } from "../../../constants/screens.constants";
import { TRACKING_FLAGS } from "../../../constants/tracking.constants";
import { spacing, typography } from "../../../theme";

/**
 * The signed-in landing screen — the shift card first (app-plan.md §1.1),
 * for employee and manager alike (a manager checks in too, §2), then the
 * services due. The card re-reads the server every time this screen regains
 * focus, which is how a check-in made on the capture screen shows up here
 * without the two screens sharing state.
 */
function HomeScreen({ navigation }) {
  const user = useSessionStore((state) => state.user);
  const isOnline = useIsOnline();
  const attendance = useMyAttendance();
  const { refetch, openRecord, isLoading } = attendance;
  const { trackingState } = useTrackingLifecycle({ openRecord, isOnline, attendanceLoaded: !isLoading });
  const servicesDue = useServerData(async () => (await listServices(SERVICE_STATUS.TODO)).data.data, { initialData: [] });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  function refreshAll() {
    refetch();
    servicesDue.refetch();
  }

  // The prominent disclosure (app-plan.md §4.1) comes before the first
  // check-in, once; after that the check-in goes straight to the camera.
  async function handleCheckIn() {
    const disclosure = await getDisclosureAnswer();

    if (!disclosure) {
      navigation.navigate(SCREENS.TRACKING_DISCLOSURE);
      return;
    }

    navigation.navigate(SCREENS.CAPTURE, { mode: CAPTURE_MODES.CHECK_IN });
  }

  // OEM guidance (app-plan.md §1.4): once, after the first successful check-in
  // on a phone whose battery manager is known to kill background services.
  useEffect(() => {
    if (!openRecord || !getOemGuidance()) {
      return;
    }

    tracking.getFlag(TRACKING_FLAGS.BATTERY_GUIDANCE).then((flag) => {
      if (!flag) {
        navigation.navigate(SCREENS.BATTERY_GUIDANCE);
      }
    });
  }, [openRecord, navigation]);

  return (
    <Screen onRefresh={refreshAll} refreshing={servicesDue.isRefreshing} testID="home-screen">
      <Text style={typography.title}>Hello, {user?.name}</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>Signed in as {user?.role}</Text>

      <TodayShiftCard
        openRecord={attendance.openRecord}
        todayRecord={attendance.todayRecord}
        isLoading={attendance.isLoading}
        error={attendance.error}
        isOnline={isOnline}
        onCheckIn={handleCheckIn}
        onCheckOut={() => navigation.navigate(SCREENS.CAPTURE, { mode: CAPTURE_MODES.CHECK_OUT })}
        trackingState={trackingState}
        onFixTracking={() => navigation.navigate(SCREENS.TRACKING_DISCLOSURE)}
      />

      <ServicesDueCard
        services={servicesDue.data}
        isLoading={servicesDue.isLoading}
        error={servicesDue.error}
        onOpen={() => navigation.navigate(SCREENS.SERVICES_TAB)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.xl },
});

export default HomeScreen;
