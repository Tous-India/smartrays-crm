import { useCallback, useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Screen from "../../../components/Screen";
import TodayShiftCard from "../../attendance/components/TodayShiftCard";
import ServicesDueCard from "../components/ServicesDueCard";
import ComplaintsCard from "../components/ComplaintsCard";
import MyStatusCard from "../../live/components/MyStatusCard";
import TodayGlanceCard from "../../live/components/TodayGlanceCard";
import useLiveMeta from "../../live/hooks/useLiveMeta";
import { getMyLiveStatus, getTeamLiveStatus } from "../../live/api/liveApi";
import useMyAttendance from "../../attendance/hooks/useMyAttendance";
import useIsOnline from "../../../hooks/useIsOnline";
import useServerData from "../../../hooks/useServerData";
import useSessionStore from "../../../store/sessionStore";
import useMyPermissions, { can, canAny } from "../../../hooks/useMyPermissions";
import { listComplaints } from "../../complaints/api/complaintApi";
import { listServices } from "../../services/api/serviceApi";
import { SERVICE_STATUS } from "../../services/services.utils";
import useTrackingLifecycle from "../../tracking/hooks/useTrackingLifecycle";
import { getDisclosureAnswer } from "../../tracking/tracking.service";
import { getOemGuidance } from "../../tracking/oem.utils";
import * as tracking from "../../tracking/trackingAdapter";
import { CAPTURE_MODES, SCREENS } from "../../../constants/screens.constants";
import { roleLabel } from "../../../constants/roles.constants";
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
  // "My" services: the ones assigned to me. The server's list for a manager
  // is the team's and their own (the Team tab shows the team's); the card
  // under the shift is about the person holding the phone.
  const servicesDue = useServerData(
    async () => (await listServices(SERVICE_STATUS.TODO)).data.data.filter((service) => String(service.assignedToId) === String(user?._id)),
    { initialData: [], deps: [user?._id] }
  );

  // Customer complaints (2026-10-23): for an assigner, the ones not assigned
  // yet; for anyone else, their own (the server sends only those).
  const { permissions } = useMyPermissions();
  const isComplaintAssigner = can(permissions, "complaints", "assign") || can(permissions, "complaints", "view_all");
  const myComplaints = useServerData(async () => (await listComplaints()).data.data, { initialData: [], deps: [user?._id] });

  // What the office sees (2026-10-23): my own live status, with a fix-it
  // button when something is wrong. Shown only while on a shift.
  const myStatus = useServerData(async () => (await getMyLiveStatus()).data.data, { deps: [user?._id, openRecord?._id] });
  const liveMeta = useLiveMeta();
  const { refetch: refetchMyStatus } = myStatus;

  // Today at a glance (2026-10-23): for whoever may see the team's
  // locations — a manager their team, an admin everyone.
  const seesTeam = canAny(permissions, "location", ["view_team", "view_all"]);
  const teamLive = useServerData(async () => (seesTeam ? (await getTeamLiveStatus()).data.data : null), { deps: [user?._id, seesTeam] });
  const { refetch: refetchTeamLive } = teamLive;

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchMyStatus();
      refetchTeamLive();
    }, [refetch, refetchMyStatus, refetchTeamLive])
  );

  function refreshAll() {
    refetch();
    servicesDue.refetch();
    myComplaints.refetch();
    myStatus.refetch();
    teamLive.refetch();
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
      <Text style={[typography.subtitle, styles.subtitle]}>Signed in as {roleLabel(user?.role)}</Text>

      <TodayShiftCard
        openRecord={attendance.openRecord}
        todayRecord={attendance.todayRecord}
        isLoading={attendance.isLoading}
        error={attendance.error}
        isOnline={isOnline}
        onCheckIn={handleCheckIn}
        onCheckOut={() => navigation.navigate(SCREENS.CAPTURE, { mode: CAPTURE_MODES.CHECK_OUT })}
        trackingState={trackingState}
        onFixTracking={() => navigation.navigate(SCREENS.TRACKING_DISCLOSURE, openRecord ? { afterwards: "back" } : undefined)}
      />

      {openRecord ? (
        <MyStatusCard
          status={myStatus.data}
          meta={liveMeta}
          onCheckTracking={() => navigation.navigate(SCREENS.TRACKING_DISCLOSURE, { afterwards: "back" })}
        />
      ) : null}

      {seesTeam ? (
        <TodayGlanceCard
          live={teamLive}
          onOpen={(filter) =>
            navigation.navigate(SCREENS.TEAM_TAB, { screen: SCREENS.TEAM, params: { segment: "live", filter, openedAt: Date.now() } })
          }
        />
      ) : null}

      <ServicesDueCard
        services={servicesDue.data}
        isLoading={servicesDue.isLoading}
        error={servicesDue.error}
        onOpen={() => navigation.navigate(SCREENS.SERVICES_TAB)}
      />

      <ComplaintsCard
        isAssigner={isComplaintAssigner}
        complaints={myComplaints.data}
        isLoading={myComplaints.isLoading}
        error={myComplaints.error}
        onOpen={() => navigation.navigate(SCREENS.SERVICES_TAB, { screen: SCREENS.COMPLAINTS, initial: false })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.xl },
});

export default HomeScreen;
