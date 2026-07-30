import { Input, Select, Segmented, Button, Space, Dropdown } from "antd";
import { PlusOutlined, UploadOutlined, DownloadOutlined, DownOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import { usePermission } from "../../../hooks/usePermission";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { FOLLOW_UP_FILTER_OPTIONS, CLIENT_TYPE_OPTIONS } from "../constants/lead.constants";

/**
 * The full filter set from leads-customer-functional-spec.md's "Filters"
 * section (search/owner/follow-up), plus the Table/Board view toggle and the
 * New Lead / Import / Export actions — all permission-gated per the leads
 * PERMISSION_REGISTRY entries (create/view).
 *
 * Import and Export were two separate buttons; combined here into one
 * "Import/Export" `Dropdown` menu button rather than a Modal/Popover — a
 * dropdown reads as the lighter-weight pattern for "one button, pick one of
 * two named actions" (no extra confirm step, opens/closes on the same
 * click), and this codebase already uses AntD `Dropdown` for menu-style
 * choices elsewhere. Selecting either option calls the exact same
 * `onImport`/`onExport` handlers as before — this only consolidates the
 * entry point, neither flow's own behavior changed. Each option is still
 * independently permission-gated (`leads.view` for Export, `leads.create`
 * for Import) exactly as the two separate buttons were, so a role holding
 * only one of the two grants still sees just that one option; the button
 * itself only renders at all if at least one grant is held.
 */
function LeadFiltersBar({
  filters,
  onFilterChange,
  view,
  onViewChange,
  onNewLead,
  onImport,
  onExport,
  isExporting,
}) {
  const { users } = useUserDirectory();
  const canExport = usePermission("leads", "view");
  const canImport = usePermission("leads", "create");

  const importExportItems = [
    canExport && { key: "export", label: "Export Leads", icon: <DownloadOutlined /> },
    canImport && { key: "import", label: "Import Leads", icon: <UploadOutlined /> },
  ].filter(Boolean);

  function handleImportExportClick({ key }) {
    if (key === "export") {
      onExport();
    } else if (key === "import") {
      onImport();
    }
  }

  const ownerOptions = [
    { value: "", label: "All owners" },
    ...users.map((user) => ({ value: user._id, label: user.name })),
  ];

  return (
    // Below `lg` (~1024px): wrap/stack freely, no attempt at one row — fine
    // for mobile/tablet per this task's own scope. At `lg`+: force a single
    // row (`flex-nowrap`) with tightened control widths so the whole
    // toolbar actually fits at 1024/1280/1440 desktop widths, plus
    // `overflow-x-auto` as a safety net rather than letting a genuinely
    // too-narrow desktop width silently clip a control.
    <div className="mb-4 flex flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-2 lg:overflow-x-auto">
      <Input.Search
        allowClear
        placeholder="Search name, company, email, phone"
        defaultValue={filters.search}
        onSearch={(value) => onFilterChange({ search: value })}
        style={{ width: 185 }}
        className="shrink-0"
      />

      <Select
        value={filters.owner || ""}
        options={ownerOptions}
        style={{ width: 140 }}
        className="shrink-0"
        onChange={(value) => onFilterChange({ owner: value })}
      />

      <Select
        value={filters.followUp || ""}
        options={FOLLOW_UP_FILTER_OPTIONS}
        style={{ width: 130 }}
        className="shrink-0"
        onChange={(value) => onFilterChange({ followUp: value })}
      />

      <Select
        value={filters.clientType || ""}
        options={[{ value: "", label: "All client types" }, ...CLIENT_TYPE_OPTIONS]}
        style={{ width: 150 }}
        className="shrink-0"
        onChange={(value) => onFilterChange({ clientType: value })}
      />

      <Segmented
        value={view}
        onChange={onViewChange}
        className="shrink-0"
        options={[
          { value: "table", label: "Table" },
          { value: "board", label: "Board" },
        ]}
      />

      <div className="shrink-0 lg:ml-auto">
        <Space size="small">
          {importExportItems.length > 0 && (
            <Dropdown menu={{ items: importExportItems, onClick: handleImportExportClick }} trigger={["click"]}>
              <Button loading={isExporting}>
                Import/Export <DownOutlined />
              </Button>
            </Dropdown>
          )}
          <PermissionGate module="leads" action="create">
            <Button type="primary" icon={<PlusOutlined />} onClick={onNewLead}>
              New Lead
            </Button>
          </PermissionGate>
        </Space>
      </div>
    </div>
  );
}

export default LeadFiltersBar;
