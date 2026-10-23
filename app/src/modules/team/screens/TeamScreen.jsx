import { useEffect, useMemo, useState } from "react";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import SegmentedControl from "../../../components/SegmentedControl";
import ListState from "../../../components/ListState";
import TeamTodaySection from "../components/TeamTodaySection";
import TeamServicesSection from "../components/TeamServicesSection";
import TeamLeaveSection from "../components/TeamLeaveSection";
import TeamLiveSection from "../../live/components/TeamLiveSection";
import useLiveMeta from "../../live/hooks/useLiveMeta";
import { getTeamLiveStatus } from "../../live/api/liveApi";
import useTeamToday from "../hooks/useTeamToday";
import useServerData from "../../../hooks/useServerData";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useMyPermissions, { can, canAny } from "../../../hooks/useMyPermissions";
import useIsOnline from "../../../hooks/useIsOnline";
import { listTeamLeaves } from "../api/teamApi";
import { listServices } from "../../services/api/serviceApi";
import { SERVICE_STATUS, sortByUrgency } from "../../services/services.utils";
import { SCREENS } from "../../../constants/screens.constants";

/**
 * The manager's Team tab (app-plan.md §2): Today · Live · Services · Leave in
 * one screen, segmented. Which segments show is the server's answer
 * (`GET /users/me/permissions`): a segment whose grant the manager lacks is
 * not drawn, and a 403 that arrives anyway is shown as the server's words.
 * Every segment reads the web's own team-scoped endpoints.
 *
 * Live (2026-10-23, replaces the plain map): everyone's live status — counts,
 * status-coloured markers, problems first — refreshed every 45 s while open,
 * like the web Live Map. For an admin the server answers with everyone.
 */
const SEGMENTS = {
  TODAY: "today",
  LIVE: "live",
  SERVICES: "services",
  LEAVE: "leave",
};

const VIEW_TEAM = ["view_team", "view_all"];
const LIVE_REFRESH_MS = 45000;

export function availableSegments(permissions) {
  const segments = [];

  if (canAny(permissions, "attendance", VIEW_TEAM)) {
    segments.push({ value: SEGMENTS.TODAY, label: "Today" });
  }

  if (canAny(permissions, "location", VIEW_TEAM)) {
    segments.push({ value: SEGMENTS.LIVE, label: "Live" });
  }

  if (can(permissions, "services", "view")) {
    segments.push({ value: SEGMENTS.SERVICES, label: "Services" });
  }

  if (canAny(permissions, "leave", VIEW_TEAM)) {
    segments.push({ value: SEGMENTS.LEAVE, label: "Leave" });
  }

  return segments;
}

function TeamScreen({ navigation }) {
  const isOnline = useIsOnline();
  const { permissions, error: permissionsError } = useMyPermissions();
  const segments = useMemo(() => availableSegments(permissions), [permissions]);
  const [segment, setSegment] = useState(null);
  const current = segment && segments.some((option) => option.value === segment) ? segment : segments[0]?.value;

  const team = useTeamToday();
  const services = useServerData(async () => sortByUrgency((await listServices(SERVICE_STATUS.TODO)).data.data), { initialData: null });
  const leaves = useServerData(async () => (await listTeamLeaves()).data.data, { initialData: null });
  const live = useServerData(async () => (await getTeamLiveStatus()).data.data, { initialData: null });
  const liveMeta = useLiveMeta();
  const { refetch: refetchLive } = live;

  useEffect(() => {
    if (current !== SEGMENTS.LIVE) return undefined;
    const timer = setInterval(refetchLive, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [current, refetchLive]);
  const { nameById } = useUserDirectory();

  function refetchAll() {
    team.refetch();
    services.refetch();
    leaves.refetch();
    live.refetch();
  }

  function openPerson(row) {
    navigation.navigate(SCREENS.TEAM_MEMBER_DAY, { employeeId: row.person._id, name: row.person.name });
  }

  const refreshing = team.isRefreshing || services.isRefreshing || leaves.isRefreshing || live.isRefreshing;

  return (
    <Screen onRefresh={refetchAll} refreshing={refreshing} testID="team-screen">
      <ScreenHeader title="Team" subtitle="Your direct reports" />

      {permissions === null ? (
        <ListState isLoading={!permissionsError} error={permissionsError} testID="team-permissions" />
      ) : segments.length === 0 ? (
        <ListState isEmpty emptyText="You have no team permissions. Ask an admin." testID="team-permissions" />
      ) : (
        <>
          <SegmentedControl options={segments} value={current} onChange={setSegment} testID="team-segment" />

          {current === SEGMENTS.TODAY ? <TeamTodaySection team={team} onOpenPerson={openPerson} /> : null}
          {current === SEGMENTS.LIVE ? (
            <TeamLiveSection live={live} meta={liveMeta} onOpenPerson={(person) => navigation.navigate(SCREENS.PERSON_DAY, { person })} />
          ) : null}
          {current === SEGMENTS.SERVICES ? (
            <TeamServicesSection
              services={services}
              nameById={nameById}
              canCreate={can(permissions, "services", "create")}
              isOnline={isOnline}
              onAssign={() => navigation.navigate(SCREENS.SERVICE_FORM, {})}
              onOpenService={(service) => navigation.navigate(SCREENS.TEAM_SERVICE_DETAIL, { serviceId: service._id })}
            />
          ) : null}
          {current === SEGMENTS.LEAVE ? (
            <TeamLeaveSection
              leaves={leaves}
              nameById={nameById}
              canApprove={can(permissions, "leave", "approve")}
              canDecline={can(permissions, "leave", "decline")}
              isOnline={isOnline}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

export default TeamScreen;
