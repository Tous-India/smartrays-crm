import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Tag } from "antd";
import dayjs from "dayjs";
import WidgetCard from "./WidgetCard";
import { usePermission } from "../../../hooks/usePermission";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { listServices } from "../../service/api/serviceApi";
import { sortByUrgency, isOverdue } from "../../service/serviceUrgency";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";

const ASSIGNEES_SHOWN = 4;
const PER_ASSIGNEE_SHOWN = 3;

/**
 * "Team Services" (§7.72) — open work grouped by assignee, so "who is
 * working on what" is answerable at a glance. Gated on `services.view`.
 *
 * Scope is the SERVER's: `GET /services?status=todo` returns a manager's
 * team and their own items, and everyone's for an admin. The widget adds no
 * scoping — the same component serves both roles unchanged, and only the
 * title says which scope it is showing. Assignees are ordered by how urgent
 * their most urgent item is; the viewer's own items are labelled "You".
 */
function TeamServicesWidget() {
  const canView = usePermission("services", "view");
  const currentUser = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listServices({ status: "todo" })
      .then((response) => {
        if (!cancelled) setServices(response.data.data);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView]);

  const nameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);

  const groups = useMemo(() => {
    const byAssignee = new Map();

    sortByUrgency(services).forEach((service) => {
      if (!byAssignee.has(service.assignedToId)) {
        byAssignee.set(service.assignedToId, []);
      }
      byAssignee.get(service.assignedToId).push(service);
    });

    // Already urgency-ordered within each group; order the groups by their
    // first (most urgent) item, which sortByUrgency has put at index 0.
    const ordered = [...byAssignee.entries()].map(([assigneeId, items]) => ({ assigneeId, items }));
    const rank = new Map(sortByUrgency(services).map((service, index) => [service._id, index]));
    ordered.sort((a, b) => rank.get(a.items[0]._id) - rank.get(b.items[0]._id));

    return ordered;
  }, [services]);

  if (!canView) {
    return null;
  }

  const overdueCount = services.filter((service) => isOverdue(service)).length;
  const title = currentUser?.role === "admin" ? "All Services" : "Team Services";

  return (
    <WidgetCard
      title={`${title}${!isLoading && !error ? ` · ${services.length} open` : ""}`}
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && services.length === 0}
      emptyDescription="No open services"
    >
      {overdueCount > 0 && (
        <div className="mb-2 text-xs">
          <Tag color="error" className="!m-0">
            {overdueCount} overdue
          </Tag>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {groups.slice(0, ASSIGNEES_SHOWN).map(({ assigneeId, items }) => (
          <div key={assigneeId} data-testid={`team-services-${assigneeId}`}>
            <div className="text-xs font-medium">
              {assigneeId === currentUser?._id ? "You" : nameById.get(assigneeId) || "—"}
              <span className="ml-1 font-normal text-gray-400">· {items.length}</span>
            </div>
            <ul className="m-0 list-none p-0">
              {items.slice(0, PER_ASSIGNEE_SHOWN).map((service) => {
                const overdue = isOverdue(service);

                return (
                  <li key={service._id} className="flex min-w-0 items-center gap-2 text-sm">
                    <span className={`min-w-0 truncate ${overdue ? "text-red-600" : ""}`}>{service.title}</span>
                    {service.dueDate && (
                      <span className={`shrink-0 text-xs ${overdue ? "font-medium text-red-600" : "text-gray-400"}`}>
                        {overdue ? "overdue " : ""}
                        {dayjs(service.dueDate).format("DD MMM")}
                      </span>
                    )}
                  </li>
                );
              })}
              {items.length > PER_ASSIGNEE_SHOWN && (
                <li className="text-xs text-gray-400">and {items.length - PER_ASSIGNEE_SHOWN} more</li>
              )}
            </ul>
          </div>
        ))}
        {groups.length > ASSIGNEES_SHOWN && (
          <div className="text-xs text-gray-400">and {groups.length - ASSIGNEES_SHOWN} more people</div>
        )}
      </div>
      <div className="mt-2 text-right text-sm">
        <Link to={ROUTE_PATHS.SERVICES}>All services →</Link>
      </div>
    </WidgetCard>
  );
}

export default TeamServicesWidget;
