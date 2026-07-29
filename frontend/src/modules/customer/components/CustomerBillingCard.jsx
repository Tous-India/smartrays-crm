import { Card, Descriptions, Button } from "antd";
import { EditOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import { BILLING_TYPE_LABELS } from "../constants/customer.constants";

/**
 * Billing Details card per leads-customer-functional-spec.md: billing type,
 * name, GSTIN, address, edit action. Its "Edit billing" button opens the
 * same shared edit form the header's "Edit" button does — see
 * CustomerEditModal.jsx for why there's only one form, not two.
 */
function CustomerBillingCard({ customer, onEdit }) {
  return (
    <Card
      title="Billing Details"
      className="mb-6 app-elevated-card"
      extra={
        <PermissionGate module="customers" action="edit">
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            Edit
          </Button>
        </PermissionGate>
      }
    >
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="Billing Type">
          {customer.billingType ? BILLING_TYPE_LABELS[customer.billingType] : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Billing Name">{customer.billingName || "—"}</Descriptions.Item>
        <Descriptions.Item label="GSTIN">{customer.gstin || "—"}</Descriptions.Item>
        <Descriptions.Item label="Billing State">{customer.billingState || "—"}</Descriptions.Item>
        <Descriptions.Item label="Billing Address" span={2}>
          {customer.billingAddress || "—"}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

export default CustomerBillingCard;
