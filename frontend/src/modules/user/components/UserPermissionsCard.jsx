import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Tag } from "antd";
import { getPermissionRegistry, getUserPermissions, getRoleTemplate } from "../../permission/api/permissionApi";
import WidgetCard from "../../dashboard/widgets/WidgetCard";

/**
 * A compact "what's different from the role default" summary, not the full
 * matrix (`PermissionMatrix` stays the Permissions page's own job) — reuses
 * `GET /permissions/registry` + `GET /users/:id/permissions` +
 * `GET /permissions/templates/:role`, the exact three calls the Individual
 * User Overrides / Role Defaults tabs already make, just diffed client-side
 * here instead of rendered as an editable grid. `admin` is skipped
 * entirely — same reasoning as the User Overrides picker's own admin
 * exclusion (§7.31): admin bypasses every permission check in code, so
 * there's no template to diff against and nothing here would ever mean
 * anything for one.
 */
function UserPermissionsCard({ user }) {
  const [overrides, setOverrides] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user.role === "admin") {
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([getPermissionRegistry(), getUserPermissions(user._id), getRoleTemplate(user.role)])
      .then(([registryRes, userPermsRes, templateRes]) => {
        if (cancelled) {
          return;
        }

        const registry = registryRes.data.data;
        const userPerms = userPermsRes.data.data;
        const defaults = templateRes.data.data.permissions;
        const diffs = [];

        Object.entries(registry).forEach(([moduleName, actions]) => {
          actions.forEach((action) => {
            const granted = Boolean(userPerms[moduleName]?.[action]);
            const isDefault = Boolean(defaults[moduleName]?.[action]);

            if (granted !== isDefault) {
              diffs.push({ moduleName, action, granted });
            }
          });
        });

        setOverrides(diffs);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user._id, user.role]);

  if (user.role === "admin") {
    return (
      <WidgetCard title="Permissions" isLoading={false} error={null} isEmpty={false}>
        <div className="text-sm text-gray-500">Admin bypasses every permission check — nothing to override.</div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard
      title="Permissions"
      isLoading={isLoading}
      error={error}
      isEmpty={overrides.length === 0}
      emptyDescription="No overrides — using role defaults"
    >
      <div className="flex flex-wrap gap-2">
        {overrides.map(({ moduleName, action, granted }) => (
          <Tag key={`${moduleName}.${action}`} color={granted ? "green" : "red"}>
            {moduleName}.{action}: {granted ? "Granted" : "Revoked"}
          </Tag>
        ))}
      </div>
      <div className="mt-2 text-right text-sm">
        <Link to={`/settings/permissions?userId=${user._id}`}>
          <Button size="small" type="link" className="!px-0">
            Manage overrides →
          </Button>
        </Link>
      </div>
    </WidgetCard>
  );
}

export default UserPermissionsCard;
