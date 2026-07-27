import { useEffect } from "react";
import { Modal, Form, Input, Select, InputNumber, DatePicker, Checkbox, Row, Col, Tabs } from "antd";
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

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      // AntD's Form already renders the per-field errors inline — nothing
      // further to do here beyond not letting the rejection go unhandled
      // (previously surfaced as an uncaught `{values, errorFields, ...}`
      // console error on every failed submit).
      return;
    }

    onSubmit({
      ...values,
      followUpDate: values.followUpDate ? values.followUpDate.toISOString() : null,
      siteSurveyDate: values.siteSurveyDate ? values.siteSurveyDate.toISOString() : null,
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
      width={680}
      styles={{ body: { paddingTop: 8, paddingBottom: 0 } }}
    >
      {/*
        Compact multi-column grid — `Row`/`Col` with `xs={24}` collapses
        every group back to one-per-row on narrow widths (mobile/tablet),
        rather than forcing a cramped 3-column layout there. Grouping is by
        field length/expected-input-length, not a mechanical "3 per row
        regardless of fit": short fields go 3-per-row where the modal width
        comfortably allows it (tightened from an earlier 2-per-row pass,
        which still needed internal scroll), but Follow-up Note and Notes
        (the only free-text fields here) each keep their own full-width row
        even though Follow-up Note is a plain single-line `Input`, not a
        `TextArea` — a short label can still want a longer answer than a
        column comfortably fits. `compact-lead-form` (below) halves AntD's
        default 24px `Form.Item` margin-bottom — the other half of what
        eliminated the modal's internal scroll, alongside the 3-column
        regrouping (fewer rows) and the Modal body's own reduced top/bottom
        padding above.

        Adding the full solar field set (10 more fields) on top of this no
        longer fits in one scroll-free screen even at this density — split
        into two Tabs instead (both tabs live inside the same `Form`, so
        validation/submission still treats it as one payload; only the
        active tab's fields are mounted at a time thanks to AntD `Tabs`
        `destroyInactiveTabPane`-equivalent default of keeping panes mounted
        but hidden, which is fine here since no field is large/expensive).
      */}
      <Form form={form} layout="vertical" className="compact-lead-form">
        <Tabs
          items={[
            {
              key: "info",
              label: "Lead Info",
              children: (
                <>
                  <Row gutter={16}>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        label="Name"
                        name="name"
                        rules={[{ required: true, message: "Name is required" }]}
                      >
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
                        <DatePicker
                          showTime={{ format: "HH:mm" }}
                          format="YYYY-MM-DD HH:mm"
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item label="Follow-up Note" name="followUpNote">
                    <Input />
                  </Form.Item>

                  <Form.Item label="Notes" name="notes" className="!mb-0">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </>
              ),
            },
            {
              key: "site",
              label: "Site Details",
              forceRender: true,
              children: (
                <>
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
                        <Form.Item
                          label=" "
                          name="subsidyApplicable"
                          valuePropName="checked"
                          className="!mb-0"
                        >
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
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}

export default LeadFormModal;
