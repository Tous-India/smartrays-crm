import { useMemo } from "react";
import { Card, List, Typography } from "antd";
import { ACTIVITY_ACTION_LABELS } from "../constants/customer.constants";
import useUserDirectory from "../../../hooks/useUserDirectory";

const { Text } = Typography;

/**
 * Activity Log per leads-customer-functional-spec.md — reuses exactly what
 * `GET /customers/:id/activity` returns (`CustomerActivity` documents:
 * created/edited/deactivated/reactivated/contract_added/contract_removed/
 * credential_revealed). No project-timer entries exist in this backend's
 * activity log to begin with, so the spec's "excludes project timer
 * entries" note is already true by construction — nothing to filter here.
 *
 * **Actor shown per entry (2026-08-05).** `CustomerActivity.performedBy`
 * has always been stored (required, `ref: "User"`) — it was simply never
 * rendered. `customer.service.js#listActivity` returns it UNPOPULATED
 * though, so the API hands over a raw ObjectId string; the name is resolved
 * here against `useUserDirectory()` (`GET /users/dropdown`, authenticate-
 * only, already fetched by pickers across the app) rather than adding a
 * `.populate()` server-side, keeping this task frontend-only as scoped.
 *
 * Consequence worth knowing: that dropdown lists `isActive: true` users
 * only, so an entry performed by a since-deactivated or deleted user has no
 * name to resolve and renders "—" rather than blank. Same for any entry
 * whose `performedBy` is missing entirely. If actors for departed staff
 * matter, the fix is a one-line `.populate("performedBy", "name")` on the
 * backend read — flagged, not silently added.
 */
function CustomerActivityLog({ activity }) {
  const { users } = useUserDirectory();

  const userNameById = useMemo(() => new Map(users.map((user) => [String(user._id), user.name])), [users]);

  return (
    <Card title="Activity Log" className="mb-6 app-elevated-card">
      <List
        dataSource={activity}
        locale={{ emptyText: "No activity recorded yet" }}
        renderItem={(entry) => {
          // `performedBy` may arrive as a raw id (today) or as a populated
          // object (if the backend read ever starts populating it) — handle
          // both so this doesn't need revisiting if that changes.
          const actorId = entry.performedBy?._id || entry.performedBy;
          const actorName = entry.performedBy?.name || userNameById.get(String(actorId)) || "—";

          return (
            <List.Item>
              <Text type="secondary" className="text-xs">
                {new Date(entry.createdAt).toLocaleString()}
              </Text>
              <span className="ml-2">{ACTIVITY_ACTION_LABELS[entry.action] || entry.action}</span>
              <span className="ml-2 text-gray-500">by {actorName}</span>
              {entry.description && <span className="ml-2 text-gray-500">— {entry.description}</span>}
            </List.Item>
          );
        }}
      />
    </Card>
  );
}

export default CustomerActivityLog;
