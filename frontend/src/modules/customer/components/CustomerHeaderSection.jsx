import { Tag, Button, Space, Popconfirm, Typography } from "antd";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import useUserDirectory from "../../../hooks/useUserDirectory";
import CustomerStatusToggleButton from "./CustomerStatusToggleButton";
import { CUSTOMER_STATUS_COLORS, CUSTOMER_STATUS_LABELS } from "../constants/customer.constants";

const { Title, Text } = Typography;

/**
 * Header Section per leads-customer-functional-spec.md: company name,
 * status badge, Edit/Deactivate-or-Activate/Delete actions, source/owner/
 * signed-up date.
 *
 * Deactivate/Activate (`CustomerStatusToggleButton`, shared with the List
 * table's Actions column) is the single-customer path onto the exact same
 * `customerStatus` transition the List page's bulk "Mark Active"/"Mark
 * Inactive" actions already trigger (`customer.service.js#updateCustomer`,
 * reused by all three) — added here because there was previously no way to
 * change one customer's status without first selecting it in the List
 * page's bulk toolbar.
 */
function CustomerHeaderSection({ customer, onEdit, onDelete, onChanged }) {
  const { users } = useUserDirectory();
  const ownerName = users.find((user) => user._id === customer.ownerId)?.name;

  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <div className="flex items-center gap-3">
          <Title level={3} className="!mb-0">
            {customer.companyName}
          </Title>
          <Tag color={CUSTOMER_STATUS_COLORS[customer.customerStatus]}>
            {CUSTOMER_STATUS_LABELS[customer.customerStatus]}
          </Tag>
        </div>
        <Text type="secondary">
          Source: {customer.source || "—"} · Owner: {ownerName || "—"} · Signed up:{" "}
          {customer.signedUpAt ? new Date(customer.signedUpAt).toLocaleDateString() : "—"}
        </Text>
        {(customer.email || customer.phone) && (
          <div>
            <Text type="secondary">
              {[customer.email, customer.phone].filter(Boolean).join(" · ")}
            </Text>
          </div>
        )}
      </div>

      <Space>
        <PermissionGate module="customers" action="edit">
          <Button icon={<EditOutlined />} onClick={onEdit}>
            Edit
          </Button>
        </PermissionGate>
        <PermissionGate module="customers" action="edit">
          <CustomerStatusToggleButton customer={customer} onChanged={onChanged} />
        </PermissionGate>
        <PermissionGate module="customers" action="delete">
          <Popconfirm title="Delete this customer?" okText="Delete" okType="danger" onConfirm={onDelete}>
            <Button danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </PermissionGate>
      </Space>
    </div>
  );
}

export default CustomerHeaderSection;
