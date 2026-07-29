import { Input, Select, Button, Space } from "antd";
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
 * actually searchable server-side yet), owner dropdown, and the status
 * filter (Active/Inactive/All) — the one control for viewing inactive
 * customers.
 *
 * A "Show Inactive" checkbox previously sat alongside this Select, driving
 * the exact same `status` filter value as a redundant two-state shortcut —
 * removed (it wasn't actually working, and duplicated what the Select
 * already covers with a finer three-way choice, including "Inactive only").
 * The Select remains the one and only way to view inactive customers.
 */
function CustomersFiltersBar({ filters, onFilterChange, onNewCustomer }) {
  const { users } = useUserDirectory();

  const ownerOptions = [
    { value: "", label: "All owners" },
    ...users.map((user) => ({ value: user._id, label: user.name })),
  ];

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
        aria-label="Owner"
        value={filters.owner || ""}
        options={ownerOptions}
        style={{ width: 180 }}
        onChange={(value) => onFilterChange({ owner: value })}
      />

      <Select
        aria-label="Status"
        value={filters.status || "active"}
        options={STATUS_OPTIONS}
        style={{ width: 140 }}
        onChange={(value) => onFilterChange({ status: value })}
      />

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
