import { Input, Select, Checkbox, Button, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { CUSTOMER_STATUS_LABELS } from "../constants/customer.constants";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

/**
 * Filters per leads-customer-functional-spec.md's Customer List View: search
 * (company name/contacts — see CustomersListPage for why contacts aren't
 * actually searchable server-side yet), owner dropdown, status filter
 * (Active/Inactive/All), and a "Show Inactive" checkbox. The checkbox and
 * the status Select both drive the same underlying `status` filter value —
 * the checkbox is a quick two-state shortcut (hide/show inactive), the
 * Select is the finer three-way control (including "Inactive only"), rather
 * than two independent, contradictory filters.
 */
function CustomersFiltersBar({ filters, onFilterChange, onNewCustomer }) {
  const { users } = useUserDirectory();

  const ownerOptions = [
    { value: "", label: "All owners" },
    ...users.map((user) => ({ value: user._id, label: user.name })),
  ];

  const showInactive = (filters.status || "active") !== "active";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input.Search
        allowClear
        placeholder="Search company name"
        defaultValue={filters.search}
        onSearch={(value) => onFilterChange({ search: value })}
        style={{ width: 260 }}
      />

      <Select
        value={filters.owner || ""}
        options={ownerOptions}
        style={{ width: 180 }}
        onChange={(value) => onFilterChange({ owner: value })}
      />

      <Select
        value={filters.status || "active"}
        options={STATUS_OPTIONS}
        style={{ width: 140 }}
        onChange={(value) => onFilterChange({ status: value })}
      />

      <Checkbox
        checked={showInactive}
        onChange={(event) => onFilterChange({ status: event.target.checked ? "all" : "active" })}
      >
        Show Inactive
      </Checkbox>

      <div className="ml-auto">
        <Space>
          <PermissionGate module="customers" action="create">
            <Button type="primary" icon={<PlusOutlined />} onClick={onNewCustomer}>
              Add Customer
            </Button>
          </PermissionGate>
        </Space>
      </div>
    </div>
  );
}

export default CustomersFiltersBar;
