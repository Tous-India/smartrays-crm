import { useEffect, useState } from "react";
import { Card, Tag, Spin, Empty, Typography, Descriptions } from "antd";
import { fetchMyPermissions } from "../modules/user/api/selfApi";
import AccountSecurityPage from "../modules/auth/components/AccountSecurityPage";
import { USER_ROLE_LABELS } from "../modules/user/constants/user.constants";

const { Text } = Typography;

/**
 * `/settings` for employees (§7.39, 2026-08-05) — their own role and
 * permissions, READ-ONLY, plus password change and 2FA.
 *
 * Reads `GET /users/me/permissions`, a self endpoint. The admin-only
 * `/users/:id/permissions` gate is untouched: an employee cannot ask about
 * anyone else because there is no id to pass.
 *
 * Password change comes from the shared `AccountSecurityPage`, which
 * deliberately offers no "reset by email" link — SMTP is a placeholder host
 * in production and that endpoint 500s, so advertising it to a signed-in user
 * who can simply change their password directly would send them nowhere.
 */
function EmployeeSettingsPage() {
  const [permissions, setPermissions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchMyPermissions()
      .then((response) => {
        if (!cancelled) setPermissions(response.data.data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const grants = Object.entries(permissions?.permissions || {});

  return (
    <div className="flex flex-col gap-4">
      <Card title="Your access" className="app-elevated-card">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        ) : (
          <>
            <Descriptions column={1} size="small" className="!mb-4">
              <Descriptions.Item label="Role">
                {USER_ROLE_LABELS[permissions?.role] || permissions?.role}
              </Descriptions.Item>
            </Descriptions>

            <Text type="secondary" className="mb-2 block text-xs">
              What you can do. These are set by an admin — this view is read-only.
            </Text>

            {grants.length === 0 ? (
              <Empty description="No module permissions granted" />
            ) : (
              <div className="flex flex-col gap-2" data-testid="own-permissions">
                {grants.map(([moduleName, actions]) => (
                  <div key={moduleName}>
                    <Text strong className="capitalize">
                      {moduleName}
                    </Text>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(actions || {})
                        .filter(([, allowed]) => allowed)
                        .map(([action]) => (
                          <Tag key={action}>{action.replace(/_/g, " ")}</Tag>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <AccountSecurityPage />
    </div>
  );
}

export default EmployeeSettingsPage;
