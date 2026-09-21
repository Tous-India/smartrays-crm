import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, List, Tag, Tooltip, App } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import WidgetCard from "./WidgetCard";
import { usePermission } from "../../../hooks/usePermission";
import { listServices, changeServiceStatus, toggleSubtask } from "../../service/api/serviceApi";
import { sortByUrgency, isOverdue } from "../../service/serviceUrgency";
import SubtaskProgress from "../../service/components/SubtaskProgress";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";

const SHOWN = 5;

/**
 * "My Services" (§7.72) — an employee's or sales associate's own open work,
 * most urgent first. Gated on `services.view` the way every widget here gates
 * itself: no grant, no widget, no error.
 *
 * The list is whatever `GET /services?status=todo` returns — for these roles
 * the server scopes that to "assigned to me", so the widget never filters by
 * assignee itself. Mark complete reuses `PATCH /services/:id/status`, which
 * already lets the assignee complete without an edit grant.
 */
function MyServicesWidget() {
  const { message } = App.useApp();
  const canView = usePermission("services", "view");
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completingId, setCompletingId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listServices({ status: "todo" });
      setServices(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) {
      return;
    }

    load();
  }, [canView, load]);

  const ordered = useMemo(() => sortByUrgency(services), [services]);

  async function handleComplete(service) {
    setCompletingId(service._id);

    try {
      await changeServiceStatus(service._id, "completed");
      setServices((current) => current.filter((one) => one._id !== service._id));
      message.success("Marked complete");
    } catch (completeError) {
      message.error(completeError.response?.data?.message || "Could not mark it complete");
    } finally {
      setCompletingId(null);
    }
  }

  // The response is the whole updated service, so the row (and its count)
  // updates in place — no refetch, no flicker.
  async function handleToggleSubtask(service, subtask, isDone) {
    try {
      const response = await toggleSubtask(service._id, subtask._id, isDone);
      setServices((current) => current.map((one) => (one._id === service._id ? response.data.data : one)));
    } catch (toggleError) {
      message.error(toggleError.response?.data?.message || "Could not update the subtask");
    }
  }

  if (!canView) {
    return null;
  }

  return (
    <WidgetCard
      title={`My Services${!isLoading && !error ? ` · ${services.length} open` : ""}`}
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && services.length === 0}
      emptyDescription="Nothing assigned to you"
    >
      <List
        size="small"
        dataSource={ordered.slice(0, SHOWN)}
        renderItem={(service) => {
          const overdue = isOverdue(service);

          return (
            <List.Item
              className="!px-0"
              data-testid={`my-service-${service._id}`}
              actions={[
                <Tooltip key="done" title="Mark complete">
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    aria-label={`Mark complete: ${service.title}`}
                    loading={completingId === service._id}
                    onClick={() => handleComplete(service)}
                  />
                </Tooltip>,
              ]}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm">{service.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                  {service.dueDate ? (
                    <Tag color={overdue ? "error" : "default"} className="!m-0 !text-xs">
                      {overdue ? "Overdue · " : "Due "}
                      {dayjs(service.dueDate).format("DD MMM")}
                    </Tag>
                  ) : (
                    <span>No due date</span>
                  )}
                </span>
                {/* Every item here is the viewer's own, so the checkboxes are live. */}
                <SubtaskProgress service={service} canToggle onToggle={handleToggleSubtask} />
              </div>
            </List.Item>
          );
        }}
      />
      {services.length > SHOWN && (
        <div className="text-xs text-gray-400">and {services.length - SHOWN} more</div>
      )}
      <div className="mt-2 text-right text-sm">
        <Link to={ROUTE_PATHS.SERVICES}>All my services →</Link>
      </div>
    </WidgetCard>
  );
}

export default MyServicesWidget;
