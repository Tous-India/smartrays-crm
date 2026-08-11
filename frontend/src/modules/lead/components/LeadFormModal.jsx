import { useState, useEffect } from "react";
import { Modal, Steps, Form, Input, Select, InputNumber, DatePicker, Checkbox, Button, Row, Col } from "antd";
import dayjs from "dayjs";
import useLeadSources from "../hooks/useLeadSources";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import {
  CLIENT_TYPE_OPTIONS,
  ROOF_TYPE_OPTIONS,
  CONNECTION_TYPE_OPTIONS,
  SITE_SURVEY_STATUS_OPTIONS,
} from "../constants/lead.constants";

// Which fields live on which step — mirrors CustomerFormWizard.jsx's
// STEP_FIELDS pattern, so `handleNext` only validates Step 1's own fields
// (name) and never Step 2's (clientType), even though both are `required`.
const STEP_FIELDS = [
  ["name", "email", "phone", "companyName", "source", "ownerId", "budget", "followUpDate", "followUpNote", "notes"],
  [
    "clientType",
    "roofType",
    "siteAddress",
    "monthlyElectricityBill",
    "estimatedUnitsConsumed",
    "estimatedCapacityKw",
    "connectionType",
    "subsidyApplicable",
    "siteSurveyStatus",
    "siteSurveyDate",
  ],
];

/**
 * Shared create/edit form — Lead Detail's "Edit" action and the Table/Board
 * "New Lead" button both use this, per leads-customer-functional-spec.md's
 * field list (Name/Email/Phone/Company/Source/Owner/Budget/Follow-up/Notes).
 * `status`/`lostReason` are deliberately NOT editable here — status changes
 * always go through `useLeadStatusChangeFlow` (Table dropdown, Board drag,
 * Detail action buttons) so the `lost`-requires-reason rule is never
 * bypassable through a plain edit form.
 *
 * A 2-step `Steps` wizard (Contact Info -> Site Details), the same pattern
 * as CustomerFormWizard.jsx/ImportWizardModal.jsx: one `Form` spans both
 * steps (so Site Details' state survives navigating back to Step 1 — see
 * the `display: none` toggle below rather than conditional unmounting),
 * `footer` fully replaces the Modal's default OK/Cancel, and `handleNext`
 * validates only Step 1's own fields (`STEP_FIELDS[0]`) before advancing —
 * Step 2's `clientType` requirement never blocks leaving Step 1.
 */
function LeadFormModal({ open, mode, initialLead, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const { sources } = useLeadSources();
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);
  const clientType = Form.useWatch("clientType", form);
  const siteSurveyStatus = Form.useWatch("siteSurveyStatus", form);

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
              siteSurveyDate: initialLead.siteSurveyDate ? dayjs(initialLead.siteSurveyDate) : null,
            }
          : { source: undefined, siteSurveyStatus: "not_scheduled", subsidyApplicable: false }
      );
    }
  }, [open, mode, initialLead, form]);

  async function handleNext() {
    try {
      await form.validateFields(STEP_FIELDS[0]);
    } catch {
      // Same as handleFinish below — AntD's Form already renders the
      // per-field errors inline, just stop the rejection going uncaught.
      return;
    }
    setCurrentStep(1);
  }

  function handleBack() {
    setCurrentStep(0);
  }

  function handleCancel() {
    form.resetFields();
    setCurrentStep(0);
    onCancel();
  }

  async function handleFinish() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    onSubmit({
      ...values,
      followUpDate: values.followUpDate ? values.followUpDate.toISOString() : null,
      siteSurveyDate: values.siteSurveyDate ? values.siteSurveyDate.toISOString() : null,
    });
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Lead" : "New Lead"}
      open={open}
      onCancel={handleCancel}
      destroyOnHidden
      width={680}
      styles={{ body: { paddingTop: 8, paddingBottom: 0 } }}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        currentStep > 0 && (
          <Button key="back" onClick={handleBack}>
            Back
          </Button>
        ),
        currentStep === 0 ? (
          <Button key="next" type="primary" onClick={handleNext}>
            Next
          </Button>
        ) : (
          <Button key="submit" type="primary" loading={isSubmitting} onClick={handleFinish}>
            {mode === "edit" ? "Save" : "Add Lead"}
          </Button>
        ),
      ]}
    >
      <Steps
        current={currentStep}
        size="small"
        className="!mb-6"
        items={[{ title: "Contact Info" }, { title: "Site Details" }]}
      />

      <Form form={form} layout="vertical" className="app-compact-form">
        {/*
          Compact multi-column grid — `Row`/`Col` with `xs={24}` collapses
          every group back to one-per-row on narrow widths (mobile/tablet),
          rather than forcing a cramped 3-column layout there. Grouping is by
          field length/expected-input-length, not a mechanical "3 per row
          regardless of fit". `app-compact-form` halves AntD's default 24px
          `Form.Item` margin-bottom, keeping each step scroll-free.

          Both steps stay mounted (`display: none` on the inactive one,
          matching CustomerFormWizard.jsx) rather than conditionally
          rendering — unmounting Step 1 while on Step 2 would lose any
          `Form.useWatch`-driven state and, more importantly, is exactly the
          "don't lose data on navigation" behavior the task calls out.
          `lead-form-step` (styles/index.css) is a small opacity/slide-in
          animation that replays automatically on the `display:none` ->
          `block` transition — no JS/library needed for it.
        */}
        <div style={{ display: currentStep === 0 ? "block" : "none" }} className="lead-form-step">
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Email" name="email">
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Phone" name="phone">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={canAssignOwner ? 8 : 12}>
              <Form.Item label="Company Name" name="companyName">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={canAssignOwner ? 8 : 12}>
              <Form.Item label="Source" name="source">
                <Select
                  allowClear
                  placeholder="Select a source"
                  options={sources.map((source) => ({ value: source.name, label: source.name }))}
                />
              </Form.Item>
            </Col>
            {canAssignOwner && (
              <Col xs={24} sm={8}>
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
                {/* Hours:minutes only — the default `showTime` also asks for
                    seconds, precision nobody scheduling a follow-up call
                    actually needs. */}
                <DatePicker showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Follow-up Note" name="followUpNote">
            <Input />
          </Form.Item>

          <Form.Item label="Notes" name="notes" className="!mb-0">
            <Input.TextArea rows={2} />
          </Form.Item>
        </div>

        <div style={{ display: currentStep === 1 ? "block" : "none" }} className="lead-form-step">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Client Type"
                name="clientType"
                rules={[{ required: true, message: "Client type is required" }]}
              >
                <Select placeholder="Select a client type" options={CLIENT_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Roof Type" name="roofType">
                <Select allowClear placeholder="Optional" options={ROOF_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Site Address" name="siteAddress">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Monthly Electricity Bill" name="monthlyElectricityBill">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Estimated Units Consumed" name="estimatedUnitsConsumed">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Estimated Capacity (kW)" name="estimatedCapacityKw">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Connection Type" name="connectionType">
                <Select allowClear placeholder="Optional" options={CONNECTION_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            {/* Subsidy schemes only apply to residential clients — hidden
                rather than shown-then-ignored for commercial/industrial. */}
            {clientType === "residential" && (
              <Col xs={24} sm={12}>
                <Form.Item label=" " name="subsidyApplicable" valuePropName="checked" className="!mb-0">
                  <Checkbox>Subsidy Applicable</Checkbox>
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item label="Site Survey Status" name="siteSurveyStatus">
                <Select options={SITE_SURVEY_STATUS_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          {/* A survey date only means something once one has actually
              been scheduled — "not_scheduled" has no date to show. */}
          {siteSurveyStatus && siteSurveyStatus !== "not_scheduled" && (
            <Form.Item label="Site Survey Date" name="siteSurveyDate" className="!mb-0">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          )}
        </div>
      </Form>
    </Modal>
  );
}

export default LeadFormModal;
