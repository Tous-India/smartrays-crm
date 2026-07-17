import { Card, List, Typography } from "antd";
import { ACTIVITY_ACTION_LABELS } from "../constants/customer.constants";

const { Text } = Typography;

/**
 * Activity Log per leads-customer-functional-spec.md — reuses exactly what
 * `GET /customers/:id/activity` returns (`CustomerActivity` documents:
 * created/edited/deactivated/reactivated/contract_added/contract_removed/
 * credential_revealed). No project-timer entries exist in this backend's
 * activity log to begin with, so the spec's "excludes project timer
 * entries" note is already true by construction — nothing to filter here.
 */
function CustomerActivityLog({ activity }) {
  return (
    <Card title="Activity Log">
      <List
        dataSource={activity}
        locale={{ emptyText: "No activity recorded yet" }}
        renderItem={(entry) => (
          <List.Item>
            <Text type="secondary" className="text-xs">
              {new Date(entry.createdAt).toLocaleString()}
            </Text>
            <span className="ml-2">{ACTIVITY_ACTION_LABELS[entry.action] || entry.action}</span>
            {entry.description && <span className="ml-2 text-gray-500">— {entry.description}</span>}
          </List.Item>
        )}
      />
    </Card>
  );
}

export default CustomerActivityLog;
