import { useEffect, useState } from "react";
import { Tabs, Spin } from "antd";
import { getPermissionRegistry } from "../api/permissionApi";
import RoleDefaultsTab from "./RoleDefaultsTab";
import UserOverridesTab from "./UserOverridesTab";

/**
 * `/settings/permissions` (§7.27) — the first real frontend for the
 * `permission` module, replacing the long-standing `PlaceholderPage`. The
 * registry (`PERMISSION_REGISTRY` — every valid module+action pair) is
 * fetched once here and passed down to both sub-tabs, so `PermissionMatrix`
 * never needs its own copy or a second fetch.
 */
function PermissionManagementPage() {
  const [registry, setRegistry] = useState(null);

  useEffect(() => {
    let isMounted = true;

    getPermissionRegistry().then((response) => {
      if (isMounted) {
        setRegistry(response.data.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!registry) {
    return <Spin />;
  }

  return (
    <Tabs
      items={[
        { key: "role-defaults", label: "Role Defaults", children: <RoleDefaultsTab registry={registry} /> },
        { key: "user-overrides", label: "Individual User Overrides", children: <UserOverridesTab registry={registry} /> },
      ]}
    />
  );
}

export default PermissionManagementPage;
