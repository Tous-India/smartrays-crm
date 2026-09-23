import { useState } from "react";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import SegmentedControl from "../../../components/SegmentedControl";
import ListState from "../../../components/ListState";
import ServiceRow from "../components/ServiceRow";
import useServerData from "../../../hooks/useServerData";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { listServices } from "../api/serviceApi";
import { SERVICE_STATUS, sortByUrgency } from "../services.utils";
import { SCREENS } from "../../../constants/screens.constants";

/**
 * My Services (app-plan.md §1.6): To Do and Completed, exactly what the
 * server returns for the caller — an employee's own, a manager's team and
 * own — ordered overdue → due soonest → undated. Tap a row for the detail.
 */
const FILTERS = [
  { value: SERVICE_STATUS.TODO, label: "To Do" },
  { value: SERVICE_STATUS.COMPLETED, label: "Completed" },
];

function ServicesScreen({ navigation }) {
  const [status, setStatus] = useState(SERVICE_STATUS.TODO);
  const services = useServerData(async () => sortByUrgency((await listServices(status)).data.data), {
    initialData: [],
    deps: [status],
  });
  const { nameById } = useUserDirectory();

  return (
    <Screen onRefresh={services.refetch} refreshing={services.isRefreshing} testID="services-screen">
      <ScreenHeader title="Services" subtitle="Work assigned to you" />
      <SegmentedControl options={FILTERS} value={status} onChange={setStatus} testID="services-filter" />

      <ListState
        isLoading={services.isLoading}
        error={services.error}
        isEmpty={services.data.length === 0}
        emptyText={status === SERVICE_STATUS.TODO ? "Nothing to do — no services assigned to you." : "No completed services yet."}
        onRetry={services.refetch}
        skeleton="service"
        testID="services-list"
      />

      {!services.isLoading && !services.error
        ? services.data.map((service) => (
            <ServiceRow
              key={service._id}
              service={service}
              assignedByName={nameById.get(service.createdById)}
              onPress={() => navigation.navigate(SCREENS.SERVICE_DETAIL, { serviceId: service._id })}
            />
          ))
        : null}
    </Screen>
  );
}

export default ServicesScreen;
