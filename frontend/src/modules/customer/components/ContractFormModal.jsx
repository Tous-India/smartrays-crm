import { useEffect } from "react";
import { Modal, Form, Select, InputNumber, Input, DatePicker } from "antd";
import dayjs from "dayjs";
import { CONTRACT_TYPE_UI_OPTIONS, CONTRACT_TYPE_LABELS } from "../constants/customer.constants";

/**
 * Add/edit a single contract. Adding a `monthly`/`onetime` contract triggers
 * backend automation (project + draft invoice) — the confirmation for that
 * is surfaced by the caller (`CustomerContractsSection`) after a successful
 * add, since this form itself doesn't know the outcome until the API call
 * returns.
 */
function ContractFormModal({ open, mode, initialContract, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  // "monthly" is hidden from the picker (see CONTRACT_TYPE_UI_OPTIONS), but
  // editing an existing monthly contract must still show it as the selected
  // value — the Select is disabled in edit mode either way, so this option
  // is never actually choosable, just displayable.
  const typeOptions =
    mode === "edit" && initialContract?.type === "monthly"
      ? [{ value: "monthly", label: CONTRACT_TYPE_LABELS.monthly }, ...CONTRACT_TYPE_UI_OPTIONS]
      : CONTRACT_TYPE_UI_OPTIONS;

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        mode === "edit" && initialContract
          ? {
              ...initialContract,
              renewalDate: initialContract.renewalDate ? dayjs(initialContract.renewalDate) : null,
            }
          : {}
      );
    }
  }, [open, mode, initialContract, form]);

  async function handleOk() {
    const values = await form.validateFields();
    onSubmit({
      ...values,
      renewalDate: values.renewalDate ? values.renewalDate.toISOString() : null,
    });
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Contract" : "Add Contract"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Type"
          name="type"
          rules={[{ required: true, message: "Type is required" }]}
          extra={
            mode === "edit"
              ? "Type isn't editable — only creating a contract triggers the project/invoice automation, so changing an existing one's type here wouldn't actually do what it looks like it would. Delete and re-add instead if the type is genuinely wrong."
              : undefined
          }
        >
          <Select options={typeOptions} disabled={mode === "edit"} />
        </Form.Item>
        <Form.Item label="Amount" name="amount">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Label" name="label">
          <Input placeholder='e.g. "Website", "Social Media Mgmt"' />
        </Form.Item>
        <Form.Item label="Renewal Date" name="renewalDate">
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Term (years)" name="termYears">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ContractFormModal;
