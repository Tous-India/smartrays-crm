import { useEffect, useRef, useState } from "react";
import { Modal, Form, Select, InputNumber, DatePicker, Input, Typography, Row, Col } from "antd";
import dayjs from "dayjs";
import { listCustomers, listContacts } from "../../customer/api/customerApi";
import useSessionStore from "../../../store/sessionStore";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Record Payment — the ONE form behind both entry points (§7.70). Whether it
 * opens from the Payments page or from a customer's own page, it submits the
 * same `POST /payments`, so a payment recorded in either place is one record
 * that shows in both.
 *
 * TWO MODES for the customer field:
 *
 * - SEARCH (Payments page, no `fixedCustomer`): a debounced search-as-you-type
 *   `Select` against `GET /customers?search=`. Its options exist only once
 *   the user has typed something.
 * - FIXED (customer page, `fixedCustomer` given): the customer is rendered as
 *   a plain label, never as the search `Select` with a pre-set value. That
 *   `Select`'s options are empty until a search is typed, so a pre-set
 *   `customerId` can never match an option — the guaranteed version of the
 *   blank-value bug already seen once on Collected By. The customer is fixed
 *   here because the page it opened from IS that customer.
 *
 * CONTACT is optional — who the money was collected from. In fixed mode the
 * options are the customer page's already-loaded contacts; in search mode
 * they are fetched once a customer is picked. A customer with no contacts
 * shows an empty picker and is still recordable.
 *
 * COLLECTED BY defaults to the person recording, but the value is set ONLY
 * AFTER `users` has resolved and only if they are in it. Setting a `Select`'s
 * value before its options exist gives a control with a value and no label —
 * the exact bug from the reverted first attempt, and the same failure the
 * fixed-customer mode above exists to avoid.
 *
 * LAYOUT: four rows instead of six — Customer alone, then Contact | Amount,
 * then Date | Collected By, then Notes alone — with `app-compact-form`'s
 * 12px item margins. The pairs are what belongs together: who paid and how
 * much; when and who took it. The two-column rows are `xs=24 sm=12`, so under
 * 576px everything stacks again. Validation messages sit inside each item's
 * own flow (AntD's explain block), so an error grows its row rather than
 * covering the one beneath.
 */

/** The two-column rows: side by side from `sm`, stacked below it. */
const HALF = { xs: 24, sm: 12 };
function RecordPaymentModal({ open, onCancel, onSubmit, isSubmitting, users, fixedCustomer, fixedCustomerContacts }) {
  const [form] = Form.useForm();
  const currentUser = useSessionStore((state) => state.user);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const debounceRef = useRef(null);

  const isFixed = Boolean(fixedCustomer);
  const contactSource = isFixed ? fixedCustomerContacts || [] : contacts;

  useEffect(() => {
    if (!open || users.length === 0 || form.getFieldValue("collectedBy")) {
      return;
    }

    const me = users.find((user) => user._id === currentUser?._id);

    if (me) {
      form.setFieldValue("collectedBy", me._id);
    }
  }, [open, users, currentUser, form]);

  function handleCustomerSearch(value) {
    clearTimeout(debounceRef.current);

    if (!value || !value.trim()) {
      setCustomerOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await listCustomers({ search: value });
        setCustomerOptions(
          response.data.data.map((customer) => ({ value: customer._id, label: customer.companyName }))
        );
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  // Search mode only: a new customer means a new contact list, and whatever
  // contact was picked belonged to the previous customer.
  async function handleCustomerChange(customerId) {
    form.setFieldValue("contactId", undefined);
    setContacts([]);

    if (!customerId) {
      return;
    }

    setIsLoadingContacts(true);
    try {
      const response = await listContacts(customerId);
      setContacts(response.data.data);
    } finally {
      setIsLoadingContacts(false);
    }
  }

  function resetAll() {
    form.resetFields();
    setCustomerOptions([]);
    setContacts([]);
  }

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      // AntD's Form already renders the per-field errors inline.
      return;
    }

    await onSubmit({
      customerId: isFixed ? fixedCustomer._id : values.customerId,
      contactId: values.contactId || null,
      amount: values.amount,
      date: values.date.toISOString(),
      notes: values.notes,
      collectedBy: values.collectedBy,
    });

    resetAll();
  }

  function handleCancel() {
    resetAll();
    onCancel();
  }

  const userOptions = users.map((user) => ({ value: user._id, label: user.name }));
  const contactOptions = contactSource.map((contact) => ({ value: contact._id, label: contact.name }));

  return (
    <Modal
      title="Record Payment"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Save"
      destroyOnHidden
      // `Row gutter` applies -8px horizontal margins, which Chrome counts as
      // 8px of scrollable overflow inside the padded modal body (the same
      // artifact UserFormModal clips); the reduced top/bottom padding is the
      // same pairing the other compact modals use.
      styles={{ body: { overflowX: "hidden", paddingTop: 8, paddingBottom: 0 } }}
    >
      <Form form={form} layout="vertical" className="app-compact-form" initialValues={{ date: dayjs() }}>
        {isFixed ? (
          <Form.Item label="Customer">
            <Typography.Text strong data-testid="fixed-customer">
              {fixedCustomer.companyName}
            </Typography.Text>
          </Form.Item>
        ) : (
          <Form.Item label="Customer" name="customerId" rules={[{ required: true, message: "Select a customer" }]}>
            <Select
              showSearch
              filterOption={false}
              onSearch={handleCustomerSearch}
              onChange={handleCustomerChange}
              loading={isSearching}
              options={customerOptions}
              placeholder="Search customer by company name…"
              notFoundContent={isSearching ? "Searching…" : "Type to search"}
            />
          </Form.Item>
        )}

        <Row gutter={16}>
          <Col {...HALF}>
            <Form.Item label="Contact" name="contactId">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={isLoadingContacts}
                options={contactOptions}
                placeholder={contactOptions.length === 0 ? "No contacts (optional)" : "Who paid? (optional)"}
                notFoundContent={isLoadingContacts ? "Loading…" : "No contacts"}
              />
            </Form.Item>
          </Col>
          <Col {...HALF}>
            <Form.Item label="Amount" name="amount" rules={[{ required: true, message: "Amount is required" }]}>
              <InputNumber min={0} style={{ width: "100%" }} prefix="₹" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col {...HALF}>
            <Form.Item label="Date" name="date" rules={[{ required: true, message: "Date is required" }]}>
              {/* Hours:minutes only — same `showTime` config as LeadFormModal's
                  own follow-up date field; the default `showTime` also asks for
                  seconds, precision a payment record doesn't need either. */}
              <DatePicker showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col {...HALF}>
            <Form.Item label="Collected By" name="collectedBy">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={userOptions}
                placeholder="Who collected it? (optional)"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default RecordPaymentModal;
