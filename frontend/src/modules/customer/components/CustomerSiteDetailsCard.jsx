import { Card, Descriptions, Button } from "antd";
import { EditOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import {
  CLIENT_TYPE_LABELS,
  ROOF_TYPE_LABELS,
  CONNECTION_TYPE_LABELS,
  NET_METERING_STATUS_LABELS,
  SUBSIDY_CLAIM_STATUS_LABELS,
} from "../constants/customer.constants";

/**
 * "Site & Installation Details" card — the solar-specific fields carried
 * over from the Lead at conversion (clientType/siteAddress/roofType/
 * connectionType/estimatedCapacityKw) plus the ones only ever filled in
 * later via a normal edit (installedCapacityKw, warranty dates, panel/
 * inverter brand+model, netMeteringStatus, subsidyClaimStatus). Its "Edit"
 * button opens the same shared `CustomerEditModal` as Billing/Header, same
 * one-form precedent as `CustomerBillingCard.jsx`.
 */
function CustomerSiteDetailsCard({ customer, onEdit }) {
  return (
    <Card
      title="Site & Installation Details"
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
        <Descriptions.Item label="Client Type">
          {customer.clientType ? CLIENT_TYPE_LABELS[customer.clientType] : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Roof Type">
          {customer.roofType ? ROOF_TYPE_LABELS[customer.roofType] : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Site Address" span={2}>
          {customer.siteAddress || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Connection Type">
          {customer.connectionType ? CONNECTION_TYPE_LABELS[customer.connectionType] : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Estimated Capacity (kW)">
          {customer.estimatedCapacityKw ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Installed Capacity (kW)">
          {customer.installedCapacityKw ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Commissioning Date">
          {customer.commissioningDate ? new Date(customer.commissioningDate).toLocaleDateString() : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Panel Brand / Model">
          {customer.panelBrand || customer.panelModel
            ? `${customer.panelBrand || "—"} / ${customer.panelModel || "—"}`
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Inverter Brand / Model">
          {customer.inverterBrand || customer.inverterModel
            ? `${customer.inverterBrand || "—"} / ${customer.inverterModel || "—"}`
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Panel Warranty Expiry">
          {customer.panelWarrantyExpiry ? new Date(customer.panelWarrantyExpiry).toLocaleDateString() : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Inverter Warranty Expiry">
          {customer.inverterWarrantyExpiry
            ? new Date(customer.inverterWarrantyExpiry).toLocaleDateString()
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Workmanship Warranty Expiry">
          {customer.workmanshipWarrantyExpiry
            ? new Date(customer.workmanshipWarrantyExpiry).toLocaleDateString()
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Net Metering Status">
          {NET_METERING_STATUS_LABELS[customer.netMeteringStatus] || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Subsidy Claim Status">
          {SUBSIDY_CLAIM_STATUS_LABELS[customer.subsidyClaimStatus] || "—"}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

export default CustomerSiteDetailsCard;
