import { useEffect, useState } from "react";
import { Modal, Form, Select, InputNumber, Input, DatePicker } from "antd";
import dayjs from "dayjs";
import { CONTRACT_TYPE_UI_OPTIONS, CONTRACT_TYPE_LABELS } from "../constants/customer.constants";

const TERM_YEARS_OPTIONS = [1, 2, 3].map((years) => ({ value: years, label: `${years} year${years > 1 ? "s" : ""}` }));

/**
 * Add/edit a single contract. Adding a `monthly`/`onetime` contract triggers
 * backend automation (project + draft invoice) — the confirmation for that
 * is surfaced by the caller (`CustomerContractsSection`) after a successful
 * add, since this form itself doesn't know the outcome until the API call
 * returns.
 *
 * Term/Start Date/Expiry Date (this last one is just `renewalDate` under a
 * clearer label for this flow) only ever apply to a Yearly contract —
 * One-time keeps the plain Type/Amount/Label form it always had, per this
 * task's own instruction not to touch that flow. `termYears` is a [1, 2, 3]
 * picker here (not the old free-entry number field) since Yearly terms are
 * always a whole number of years in practice; `startDate` is a new field
 * (contract.model.js) added specifically so the term's start is a real,
 * persisted fact, not just a scratch value discarded after computing the
 * expiry.
 *
 * Auto-calc behavior (a deliberate choice among a couple reasonable ones):
 * Expiry auto-fills as Start Date + Term the moment both are set, but only
 * until the admin edits Expiry directly — once they do, it's treated as an
 * intentional override and never silently recalculated again for this open
 * form, even if Start Date or Term change afterward. Editing an existing
 * contract that already has an expiry starts with that same "don't touch
 * it" state, so reopening the form for edit never recomputes a value that
 * was already saved. `form.setFieldValue` (the auto-calc's own write) does
 * NOT fire the DatePicker's own `onChange` — only Form's `onValuesChange` —
 * which is exactly the hook used here to tell "the admin typed/picked this"
 * apart from "the form computed this for them".
 */
function ContractFormModal({ open, mode, initialContract, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const [contractType, setContractType] = useState(null);
  const [hasManuallyEditedExpiry, setHasManuallyEditedExpiry] = useState(false);
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
      const initialType = mode === "edit" && initialContract ? initialContract.type : null;
      setContractType(initialType);
      setHasManuallyEditedExpiry(Boolean(mode === "edit" && initialContract?.renewalDate));

      form.setFieldsValue(
        mode === "edit" && initialContract
          ? {
              ...initialContract,
              startDate: initialContract.startDate ? dayjs(initialContract.startDate) : null,
              renewalDate: initialContract.renewalDate ? dayjs(initialContract.renewalDate) : null,
            }
          : {}
      );
    }
  }, [open, mode, initialContract, form]);

  function handleValuesChange(changedValues) {
    if (changedValues.type !== undefined) {
      setContractType(changedValues.type);
    }

    if (hasManuallyEditedExpiry) {
      return;
    }

    if (changedValues.startDate !== undefined || changedValues.termYears !== undefined) {
      const { startDate, termYears } = form.getFieldsValue(["startDate", "termYears"]);

      if (startDate && termYears) {
        form.setFieldValue("renewalDate", startDate.add(termYears, "year"));
      }
    }
  }

  async function handleOk() {
    const values = await form.validateFields();
    // AntD's Form keeps a field's last value in its internal store even
    // after its Form.Item unmounts (the Term/Start/Expiry fields, hidden
    // for anything but Yearly) — explicitly clearing them here for a
    // non-Yearly submission stops a value entered while briefly set to
    // Yearly from silently surviving a switch back to One-time.
    const isYearlySubmit = values.type === "yearly";
    onSubmit({
      ...values,
      termYears: isYearlySubmit ? values.termYears : null,
      startDate: isYearlySubmit && values.startDate ? values.startDate.toISOString() : null,
      renewalDate: isYearlySubmit && values.renewalDate ? values.renewalDate.toISOString() : null,
    });
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  const isYearly = contractType === "yearly";

  return (
    <Modal
      title={mode === "edit" ? "Edit Contract" : "Add Contract"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
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

        {isYearly && (
          <>
            <Form.Item label="Term" name="termYears">
              <Select options={TERM_YEARS_OPTIONS} placeholder="Select term" />
            </Form.Item>
            <Form.Item label="Start Date" name="startDate">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="Expiry Date"
              name="renewalDate"
              extra="Auto-fills from Start Date + Term once both are set — editing it directly keeps your value from then on."
            >
              <DatePicker style={{ width: "100%" }} onChange={() => setHasManuallyEditedExpiry(true)} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}

export default ContractFormModal;
