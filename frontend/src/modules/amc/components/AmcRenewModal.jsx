import { useEffect } from "react";
import dayjs from "dayjs";
import { Modal, Form, InputNumber, DatePicker, Alert } from "antd";

/**
 * Renew confirmation for one AMC term. Pre-filled with exactly the defaults
 * the server would derive on its own — start where the current term ends,
 * run one year, carry the amount over — so confirming without edits produces
 * the same record as posting an empty body. Every field stays editable
 * before confirming, which is the point of showing the modal rather than
 * renewing straight from the card.
 *
 * The Alert is not decoration: renewing expires the current term, and that
 * consequence isn't obvious from a button labelled "Renew". It also states
 * the thing people worry about — the old term's figures are kept, not
 * overwritten.
 */
function AmcRenewModal({ open, amc, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open || !amc) {
      return;
    }

    const start = dayjs(amc.renewalDate);

    form.setFieldsValue({
      startDate: start,
      renewalDate: start.add(1, "year"),
      amount: amc.amount ?? null,
    });
  }, [open, amc, form]);

  async function handleOk() {
    const values = await form.validateFields();

    onSubmit({
      // `YYYY-MM-DD` from dayjs's own local-date formatter — never
      // `toISOString()` on a local-midnight value, which lands a day early
      // at UTC+5:30 (the bug caught in the previous batch).
      startDate: values.startDate.format("YYYY-MM-DD"),
      renewalDate: values.renewalDate.format("YYYY-MM-DD"),
      amount: values.amount ?? null,
    });
  }

  return (
    <Modal
      title="Renew AMC"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={isSubmitting}
      okText="Confirm Renewal"
      destroyOnHidden
    >
      <Alert
        className="mb-4"
        type="info"
        showIcon
        message="This starts a new term"
        description="The current term is marked expired and kept as history — its amount and dates are not changed. The new term is created as a separate record."
      />

      <Form form={form} layout="vertical">
        <Form.Item
          label="New Start Date"
          name="startDate"
          rules={[{ required: true, message: "Start date is required" }]}
        >
          <DatePicker className="w-full" format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item
          label="New Renewal Date"
          name="renewalDate"
          dependencies={["startDate"]}
          rules={[
            { required: true, message: "Renewal date is required" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                const start = getFieldValue("startDate");

                if (!value || !start || value.isAfter(start)) {
                  return Promise.resolve();
                }

                return Promise.reject(new Error("Renewal date must be after the start date"));
              },
            }),
          ]}
        >
          <DatePicker className="w-full" format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item label="Amount" name="amount">
          <InputNumber min={0} className="w-full" placeholder="Carried over from the current term" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default AmcRenewModal;
