import { useEffect } from "react";
import { Modal, Form, Input, Select, InputNumber, DatePicker, Divider, Row, Col } from "antd";
import dayjs from "dayjs";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import {
  BILLING_TYPE_LABELS,
  CLIENT_TYPE_OPTIONS,
  ROOF_TYPE_OPTIONS,
  CONNECTION_TYPE_OPTIONS,
  NET_METERING_STATUS_OPTIONS,
  SUBSIDY_CLAIM_STATUS_OPTIONS,
} from "../constants/customer.constants";

const BILLING_TYPE_OPTIONS = Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const SOLAR_DATE_FIELDS = ["commissioningDate", "panelWarrantyExpiry", "inverterWarrantyExpiry", "workmanshipWarrantyExpiry"];

/**
 * One shared edit form for both the header's "Edit" button and the Billing
 * card's own "Edit billing" button — the backend has a single
 * `PATCH /customers/:id` covering every field (there's no separate billing
 * endpoint), so two different entry points opening the same form (just
 * scrolled/focused differently in a future pass) is more honest than
 * pretending there are two distinct save operations.
 */
function CustomerEditModal({ open, customer, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);

  const canReassignOwner = currentUser?.role !== "sales_associate";

  useEffect(() => {
    if (open && customer) {
      const dateFields = {};
      SOLAR_DATE_FIELDS.forEach((field) => {
        dateFields[field] = customer[field] ? dayjs(customer[field]) : null;
      });
      form.setFieldsValue({ ...customer, ...dateFields });
    }
  }, [open, customer, form]);

  async function handleOk() {
    const values = await form.validateFields();
    const dateFields = {};
    SOLAR_DATE_FIELDS.forEach((field) => {
      dateFields[field] = values[field] ? values[field].toISOString() : null;
    });
    onSubmit({ ...values, ...dateFields });
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title="Edit Customer"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Company Name"
          name="companyName"
          rules={[{ required: true, message: "Company name is required" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Email" name="email">
          <Input type="email" />
        </Form.Item>
        <Form.Item label="Phone" name="phone">
          <Input />
        </Form.Item>
        <Form.Item label="Website" name="website">
          <Input />
        </Form.Item>
        <Form.Item label="Industry" name="industry">
          <Input />
        </Form.Item>
        <Form.Item label="Source" name="source">
          <Input />
        </Form.Item>
        {canReassignOwner && (
          <Form.Item label="Owner" name="ownerId">
            <Select
              options={users.map((user) => ({ value: user._id, label: user.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        )}
        <Form.Item label="Project Manager" name="projectManagerId">
          <Select
            options={users.map((user) => ({ value: user._id, label: user.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item label="Billing Type" name="billingType">
          <Select allowClear options={BILLING_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Billing Name" name="billingName">
          <Input />
        </Form.Item>
        <Form.Item label="Billing Address" name="billingAddress">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="Billing State" name="billingState">
          <Input placeholder='e.g. "07 Delhi"' />
        </Form.Item>
        <Form.Item label="GSTIN" name="gstin">
          <Input />
        </Form.Item>
        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Divider>Site & Installation Details</Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Client Type" name="clientType">
              <Select allowClear options={CLIENT_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Roof Type" name="roofType">
              <Select allowClear options={ROOF_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Site Address" name="siteAddress">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Connection Type" name="connectionType">
              <Select allowClear options={CONNECTION_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Estimated Capacity (kW)" name="estimatedCapacityKw">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Installed Capacity (kW)" name="installedCapacityKw">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Commissioning Date" name="commissioningDate">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Panel Brand" name="panelBrand">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Panel Model" name="panelModel">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Inverter Brand" name="inverterBrand">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Inverter Model" name="inverterModel">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Panel Warranty Expiry" name="panelWarrantyExpiry">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Inverter Warranty Expiry" name="inverterWarrantyExpiry">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Workmanship Warranty Expiry" name="workmanshipWarrantyExpiry">
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Net Metering Status" name="netMeteringStatus">
              <Select options={NET_METERING_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Subsidy Claim Status" name="subsidyClaimStatus" className="!mb-0">
              <Select options={SUBSIDY_CLAIM_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

export default CustomerEditModal;
