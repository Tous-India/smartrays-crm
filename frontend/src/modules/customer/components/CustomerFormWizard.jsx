import { useState } from "react";
import { Modal, Steps, Form, Input, Select, InputNumber, DatePicker, Checkbox, Button, Space } from "antd";
import { PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { BILLING_TYPE_LABELS, CONTRACT_TYPE_LABELS } from "../constants/customer.constants";

const BILLING_TYPE_OPTIONS = Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const CONTRACT_TYPE_OPTIONS = Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const STEP_FIELDS = [
  ["companyName", "email", "phone", "website", "industry", "source", "ownerId"],
  ["billingType", "billingName", "billingAddress", "billingState", "gstin"],
  ["contracts"],
  ["contacts"],
  ["projectManagerId"],
];

/**
 * Add Customer wizard — a modal with Ant Design `Steps`, the same pattern
 * the Leads Import wizard established (`ImportWizardModal.jsx`), rather than
 * a dedicated route: this is a short, one-shot creation flow the user
 * completes in one sitting, not something worth a linkable/refreshable URL
 * the way Lead/Customer Detail are.
 *
 * Per leads-customer-functional-spec.md's Customer Creation Flow, in the
 * exact order this task specifies: Company info → Billing → Contracts
 * (optional) → Contacts (optional) → Project Manager (required — the one
 * field `POST /customers` can't default, per
 * `customer.validation.js#validateCreateCustomerInput`). One Ant Design
 * `Form` spans every step (contracts/contacts are `Form.List`s within it)
 * so validation and final values work as one coherent object; only the
 * current step's own fields are validated before advancing.
 *
 * Nothing is sent to the API until the final step — creating the customer,
 * then each staged contract/contact, are all orchestrated by the caller
 * (`CustomersListPage`) after `onSubmit` fires with the complete payload, so
 * this component stays a pure form and the caller can surface what
 * automation each contract triggered (see that file).
 */
function CustomerFormWizard({ open, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);

  const canAssignOwner = currentUser?.role !== "sales_associate";

  async function handleNext() {
    await form.validateFields(STEP_FIELDS[currentStep]);
    setCurrentStep((step) => step + 1);
  }

  function handleBack() {
    setCurrentStep((step) => step - 1);
  }

  function handleCancel() {
    form.resetFields();
    setCurrentStep(0);
    onCancel();
  }

  async function handleFinish() {
    const values = await form.validateFields();
    onSubmit(values);
  }

  const userOptions = users.map((user) => ({ value: user._id, label: user.name }));

  return (
    <Modal
      title="Add Customer"
      open={open}
      onCancel={handleCancel}
      width={700}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        currentStep > 0 && (
          <Button key="back" onClick={handleBack}>
            Back
          </Button>
        ),
        currentStep < STEP_FIELDS.length - 1 ? (
          <Button key="next" type="primary" onClick={handleNext}>
            Next
          </Button>
        ) : (
          <Button key="finish" type="primary" loading={isSubmitting} onClick={handleFinish}>
            Save
          </Button>
        ),
      ]}
    >
      <Steps
        current={currentStep}
        size="small"
        className="!mb-6"
        items={[
          { title: "Company Info" },
          { title: "Billing" },
          { title: "Contracts" },
          { title: "Contacts" },
          { title: "Project Manager" },
        ]}
      />

      <Form form={form} layout="vertical" initialValues={{ contracts: [], contacts: [] }}>
        <div style={{ display: currentStep === 0 ? "block" : "none" }}>
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
          {canAssignOwner && (
            <Form.Item label="Owner" name="ownerId">
              <Select allowClear placeholder="Defaults to you" options={userOptions} showSearch optionFilterProp="label" />
            </Form.Item>
          )}
        </div>

        <div style={{ display: currentStep === 1 ? "block" : "none" }}>
          <Form.Item label="Billing Type" name="billingType">
            <Select allowClear placeholder="Optional" options={BILLING_TYPE_OPTIONS} />
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
        </div>

        <div style={{ display: currentStep === 2 ? "block" : "none" }}>
          <Form.List name="contracts">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" className="mb-2 flex w-full" wrap>
                    <Form.Item
                      name={[field.name, "type"]}
                      rules={[{ required: true, message: "Type required" }]}
                      className="!mb-0"
                    >
                      <Select
                        aria-label="Contract type"
                        placeholder="Type"
                        options={CONTRACT_TYPE_OPTIONS}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, "amount"]} className="!mb-0">
                      <InputNumber placeholder="Amount" min={0} />
                    </Form.Item>
                    <Form.Item name={[field.name, "label"]} className="!mb-0">
                      <Input placeholder="Label (e.g. Website)" />
                    </Form.Item>
                    <Form.Item name={[field.name, "renewalDate"]} className="!mb-0">
                      <DatePicker placeholder="Renewal date" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} block>
                  Add Contract (optional)
                </Button>
              </>
            )}
          </Form.List>
        </div>

        <div style={{ display: currentStep === 3 ? "block" : "none" }}>
          <Form.List name="contacts">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" className="mb-2 flex w-full" wrap>
                    <Form.Item
                      name={[field.name, "name"]}
                      rules={[{ required: true, message: "Name required" }]}
                      className="!mb-0"
                    >
                      <Input placeholder="Name" />
                    </Form.Item>
                    <Form.Item name={[field.name, "email"]} className="!mb-0">
                      <Input placeholder="Email" type="email" />
                    </Form.Item>
                    <Form.Item name={[field.name, "phone"]} className="!mb-0">
                      <Input placeholder="Phone" />
                    </Form.Item>
                    <Form.Item name={[field.name, "designation"]} className="!mb-0">
                      <Input placeholder="Designation" />
                    </Form.Item>
                    <Form.Item name={[field.name, "isPrimary"]} valuePropName="checked" className="!mb-0">
                      <Checkbox>Primary</Checkbox>
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} block>
                  Add Contact (optional)
                </Button>
              </>
            )}
          </Form.List>
        </div>

        <div style={{ display: currentStep === 4 ? "block" : "none" }}>
          <Form.Item
            label="Project Manager"
            name="projectManagerId"
            rules={[{ required: true, message: "A project manager is required" }]}
          >
            <Select placeholder="Select a project manager" options={userOptions} showSearch optionFilterProp="label" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

export default CustomerFormWizard;
