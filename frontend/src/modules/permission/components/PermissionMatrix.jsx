import { useEffect, useState } from "react";
import { Table, Checkbox, Button } from "antd";

/**
 * Shared matrix used by both the Role Defaults and User Overrides tabs
 * (§7.27) — rows are `PERMISSION_REGISTRY` modules, columns are the union
 * of every action that appears anywhere in the registry. A module only
 * gets a checkbox in the columns actually valid for it (per the registry);
 * every other cell is blank, not a disabled/unchecked checkbox, so an
 * invalid module+action combination is never visually confused with a
 * real "off" grant.
 *
 * Controlled by `value` (the current permissions object — a role
 * template's or a specific user's) but keeps its own local editing state,
 * reset whenever `value` changes (switching role/user) — this is a "save
 * explicitly" form, not an autosave-on-every-click one, so in-progress
 * edits shouldn't silently apply. `onSave` receives the current local
 * state; each tab wires that to its own save endpoint (template PATCH vs.
 * user-permissions PATCH), keeping this component itself endpoint-agnostic.
 */
function PermissionMatrix({ registry, value, onSave, isSaving }) {
  const [localPermissions, setLocalPermissions] = useState(value || {});

  useEffect(() => {
    setLocalPermissions(value || {});
  }, [value]);

  const modules = Object.keys(registry);
  const allActions = [...new Set(Object.values(registry).flat())].sort();

  function toggle(moduleName, action) {
    setLocalPermissions((current) => ({
      ...current,
      [moduleName]: {
        ...current[moduleName],
        [action]: !current[moduleName]?.[action],
      },
    }));
  }

  const columns = [
    { title: "Module", dataIndex: "module", key: "module", fixed: "left" },
    ...allActions.map((action) => ({
      title: action,
      dataIndex: action,
      key: action,
      align: "center",
      render: (_, record) => {
        if (!registry[record.module].includes(action)) {
          return null;
        }

        return (
          <Checkbox
            aria-label={`${record.module} ${action}`}
            checked={Boolean(localPermissions[record.module]?.[action])}
            onChange={() => toggle(record.module, action)}
          />
        );
      },
    })),
  ];

  const dataSource = modules.map((moduleName) => ({ key: moduleName, module: moduleName }));

  return (
    <div>
      <Table
        rowKey="key"
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        scroll={{ x: "max-content" }}
        size="small"
      />
      <Button
        type="primary"
        className="mt-4"
        loading={isSaving}
        onClick={() => onSave(localPermissions)}
      >
        Save
      </Button>
    </div>
  );
}

export default PermissionMatrix;
