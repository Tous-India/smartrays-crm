import { StyleSheet, Text, View } from "react-native";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import OfflineNote from "../../../components/OfflineNote";
import ServiceRow from "../../services/components/ServiceRow";
import { groupServicesByAssignee } from "../team.utils";
import { spacing, typography } from "../../../theme";

/**
 * The team's open services grouped by assignee, overdue flagged on the row
 * (ServiceRow), and — for a manager the server lets create — the way in to
 * assigning one. `services` is `GET /services?status=todo` for the caller:
 * the server's scope is the team and the manager's own.
 */
function TeamServicesSection({ services, nameById, canCreate, isOnline, onAssign, onOpenService }) {
  const groups = services.data ? groupServicesByAssignee(services.data, nameById) : [];

  return (
    <>
      {canCreate ? (
        <>
          <PrimaryButton title="Assign a service" onPress={onAssign} disabled={!isOnline} style={styles.assign} testID="team-assign-service" />
          {!isOnline ? <OfflineNote what="assigning a service" /> : null}
        </>
      ) : null}

      <ListState
        isLoading={services.isLoading}
        error={services.error}
        isEmpty={Boolean(services.data) && services.data.length === 0}
        emptyText="No open services on the team."
        onRetry={services.refetch}
        testID="team-services"
      />

      {services.data && !services.error
        ? groups.map((group) => (
            <View key={group.assigneeId} testID={`team-services-group-${group.assigneeId}`}>
              <Text style={[typography.label, styles.groupTitle]}>
                {group.name} · {group.services.length}
              </Text>
              {group.services.map((service) => (
                <ServiceRow key={service._id} service={service} assignedByName={nameById.get(service.createdById)} onPress={() => onOpenService(service)} />
              ))}
            </View>
          ))
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  assign: { marginBottom: spacing.lg },
  groupTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
});

export default TeamServicesSection;
