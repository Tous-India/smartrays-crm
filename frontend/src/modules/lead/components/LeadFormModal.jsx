import { useEffect } from "react";
import { Modal, Form, Input, Select, InputNumber, DatePicker, Row, Col } from "antd";
import dayjs from "dayjs";
import useLeadSources from "../hooks/useLeadSources";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";

/**
 * Shared create/edit form — Lead Detail's "Edit" action and the Table/Board
 * "New Lead" button both use this, per leads-customer-functional-spec.md's
 * field list (Name/Email/Phone/Company/Source/Owner/Budget/Follow-up/Notes).
 * `status`/`lostReason` are deliberately NOT editable here — status changes
 * always go through `useLeadStatusChangeFlow` (Table dropdown, Board drag,
 * Detail action buttons) so the `lost`-requires-reason rule is never
 * bypassable through a plain edit form.
 */
function LeadFormModal({ open, mode, initialLead, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const { sources } = useLeadSources();
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);

  // Backend forces ownerId to the creator for a sales_associate regardless
  // of what's sent (lead.service.js#resolveOwnerIdForCreate) and excludes it
  // from their updatable fields entirely — so the picker is hidden for them
  // rather than shown-then-silently-ignored.
  const canAssignOwner = currentUser?.role !== "sales_associate";

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        mode === "edit" && initialLead
          ? {
              ...initialLead,
              followUpDate: initialLead.followUpDate ? dayjs(initialLead.followUpDate) : null,
            }
          : { source: undefined }
      );
    }
  }, [open, mode, initialLead, form]);

  async function handleOk() {
    const values = await form.validateFields();

    onSubmit({
      ...values,
      followUpDate: values.followUpDate ? values.followUpDate.toISOString() : null,
    });
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Lead" : "New Lead"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
      width={640}
    >
      {/*
        Compact multi-column grid (was one field per row, wasting horizontal
        space on short fields like Name/Email) — `Row`/`Col` with `xs={24}`
        collapses every group back to one-per-row on narrow widths (mobile/
        tablet), rather than forcing a cramped 3-column layout there.
        Grouping is by field length/expected-input-length, not a mechanical
        "3 per row regardless of fit": short fields pair 2–3 per row, but
        Follow-up Note and Notes (the only free-text fields here) each keep
        their own full-width row even though Follow-up Note is a plain
        single-line `Input`, not a `TextArea` — a short label can still want
        a longer answer than a half-width column comfortably fits.
      */}
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Email" name="email">
              <Input type="email" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Phone" name="phone">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Company Name" name="companyName">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          {/* Source alone takes the full row when Owner isn't shown at all
              (sales_associate) rather than leaving an empty half-row gap. */}
          <Col xs={24} sm={canAssignOwner ? 12 : 24}>
            <Form.Item label="Source" name="source">
              <Select
                allowClear
                placeholder="Select a source"
                options={sources.map((source) => ({ value: source.name, label: source.name }))}
              />
            </Form.Item>
          </Col>
          {canAssignOwner && (
            <Col xs={24} sm={12}>
              <Form.Item label="Owner" name="ownerId">
                <Select
                  allowClear
                  placeholder="Defaults to you"
                  options={users.map((user) => ({ value: user._id, label: user.name }))}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Budget" name="budget">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Follow-up Date" name="followUpDate">
              <DatePicker showTime style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Follow-up Note" name="followUpNote">
          <Input />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default LeadFormModal;
