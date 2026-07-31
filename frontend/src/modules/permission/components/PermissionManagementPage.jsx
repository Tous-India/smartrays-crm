import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
 *
 * `?userId=` (added 2026-07-31, §7.32) — deep-links straight to the
 * Individual User Overrides tab with that user preselected, e.g. from the
 * new User Detail page's own Permissions card "Manage overrides" link,
 * rather than landing on Role Defaults and making the admin re-pick the
 * same user they just came from.
 */
function PermissionManagementPage() {
  const [searchParams] = useSearchParams();
  const deepLinkedUserId = searchParams.get("userId");
  const [registry, setRegistry] = useState(null);
  const [activeKey, setActiveKey] = useState(deepLinkedUserId ? "user-overrides" : "role-defaults");

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
      activeKey={activeKey}
      onChange={setActiveKey}
      items={[
        { key: "role-defaults", label: "Role Defaults", children: <RoleDefaultsTab registry={registry} /> },
        {
          key: "user-overrides",
          label: "Individual User Overrides",
          children: <UserOverridesTab registry={registry} initialUserId={deepLinkedUserId} />,
        },
      ]}
    />
  );
}

export default PermissionManagementPage;
