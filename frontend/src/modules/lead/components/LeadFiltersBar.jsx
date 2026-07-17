import { Input, Select, Segmented, Button, Space } from "antd";
import { PlusOutlined, UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { FOLLOW_UP_FILTER_OPTIONS } from "../constants/lead.constants";

/**
 * The full filter set from leads-customer-functional-spec.md's "Filters"
 * section (search/owner/follow-up), plus the Table/Board view toggle and the
 * New Lead / Import / Export actions — all permission-gated per the leads
 * PERMISSION_REGISTRY entries (create/view).
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

  const ownerOptions = [
    { value: "", label: "All owners" },
    ...users.map((user) => ({ value: user._id, label: user.name })),
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input.Search
        allowClear
        placeholder="Search name, company, email, phone"
        defaultValue={filters.search}
        onSearch={(value) => onFilterChange({ search: value })}
        style={{ width: 280 }}
      />

      <Select
        value={filters.owner || ""}
        options={ownerOptions}
        style={{ width: 180 }}
        onChange={(value) => onFilterChange({ owner: value })}
      />

      <Select
        value={filters.followUp || ""}
        options={FOLLOW_UP_FILTER_OPTIONS}
        style={{ width: 170 }}
        onChange={(value) => onFilterChange({ followUp: value })}
      />

      <Segmented
        value={view}
        onChange={onViewChange}
        options={[
          { value: "table", label: "Table" },
          { value: "board", label: "Board" },
        ]}
      />

      <div className="ml-auto">
        <Space>
          <PermissionGate module="leads" action="view">
            <Button icon={<DownloadOutlined />} onClick={onExport} loading={isExporting}>
              Export
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="create">
            <Button icon={<UploadOutlined />} onClick={onImport}>
              Import
            </Button>
          </PermissionGate>
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
