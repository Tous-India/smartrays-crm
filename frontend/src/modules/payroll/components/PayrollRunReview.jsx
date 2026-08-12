import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  approvePeriod,
  createAdjustment,
  getPeriodReview,
  markPeriodPaid,
  runPayrollDraft,
  submitPeriodForReview,
} from "../api/payrollApi";

const { Text } = Typography;

/**
 * The pay run review screen (§7.54, 2026-08-12).
 *
 * **The inputs to payroll are imperfect by design.** A manual roster mark
 * carries no device evidence, an unapproved absence deducts at 2×, and an
 * employee nobody recorded anything for is paid their full salary. None of
 * those are bugs — they are judgement calls the data cannot make — so an admin
 * has to see the numbers before they become somebody's pay. That is what this
 * screen is for; it is not a formality between the run and the payslip.
 *
 * ANOMALIES ARE FLAGGED, NOT BLOCKED. Every flag here has a legitimate cause as
 * well as a suspicious one: a long unpaid absence and a mistaken roster mark
 * produce the same high deduction. Refusing to proceed would make the common
 * case painful to serve the rare one; the flag draws the eye and a human
 * decides.
 *
 * STATES: draft → review → approved → paid. Approval is the freeze — after it,
 * nothing recomputes from live attendance, so editing a July record in
 * September cannot move July's pay.
 */

const ANOMALY_TONE = {
  NO_BASE_SALARY: { color: "red", label: "No salary set" },
  NO_RECORD: { color: "red", label: "No record" },
  NO_ATTENDANCE: { color: "orange", label: "No attendance" },
  HIGH_DEDUCTION: { color: "orange", label: "High deduction" },
  UNAPPROVED_ABSENCE: { color: "magenta", label: "Unapproved absence" },
  HAS_ADJUSTMENT: { color: "blue", label: "Correction carried" },
};

const STATUS_TONE = {
  draft: { color: "default", help: "Regenerates freely from current data. Not payable." },
  review: { color: "processing", help: "Being checked. Still not frozen." },
  approved: { color: "success", help: "Frozen — figures can no longer change." },
  paid: { color: "green", help: "Recorded as paid." },
};

function money(value) {
  return value == null ? "—" : `₹${value.toLocaleString()}`;
}

function PayrollRunReview() {
  const [month, setMonth] = useState(() => dayjs().subtract(1, "month"));
  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState(null);
  const [adjustingFor, setAdjustingFor] = useState(null);
  const [form] = Form.useForm();

  const period = useMemo(() => ({ year: month.year(), month: month.month() + 1 }), [month]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getPeriodReview(period);
      setReview(response.data.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load the pay run.");
      setReview(null);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  /** Every action shares this: run it, surface the server's own message, reload. */
  async function act(operation, successMessage) {
    setIsWorking(true);

    try {
      await operation();
      message.success(successMessage);
      await load();
    } catch (requestError) {
      // The server's message is the useful one — it names the state that
      // blocked the transition.
      message.error(requestError.response?.data?.message || "That did not work.");
    } finally {
      setIsWorking(false);
    }
  }

  async function submitAdjustment() {
    const values = await form.validateFields();

    await act(
      () =>
        createAdjustment({
          ...period,
          employeeId: adjustingFor.employeeId,
          amount: values.amount,
          reason: values.reason,
        }),
      "Correction raised — it will appear on the next run"
    );

    setAdjustingFor(null);
    form.resetFields();
  }

  const status = review?.status || null;
  const tone = status ? STATUS_TONE[status] : null;

  const columns = [
    {
      title: "Employee",
      dataIndex: "name",
      key: "name",
      render: (name) => <span className="font-medium">{name}</span>,
    },
    {
      title: "Present",
      dataIndex: "presentDays",
      key: "presentDays",
      align: "right",
      render: (value) => (value == null ? "—" : value),
    },
    {
      title: "Paid Leave",
      dataIndex: "paidLeaveDays",
      key: "paidLeaveDays",
      align: "right",
      render: (value) => (value == null ? "—" : value),
    },
    {
      title: "Charged Days",
      dataIndex: "unpaidDeductionDays",
      key: "unpaidDeductionDays",
      align: "right",
      render: (value, row) =>
        value == null ? (
          "—"
        ) : (
          <span className="whitespace-nowrap">
            {value}
            {row.doubleDeductionDays > 0 && (
              <Tooltip title={`${row.doubleDeductionDays} unapproved absence day(s) charged at 2×`}>
                <Text type="danger" className="ml-1 cursor-help font-semibold">
                  ×2
                </Text>
              </Tooltip>
            )}
          </span>
        ),
    },
    { title: "Gross", dataIndex: "grossAmount", key: "grossAmount", align: "right", render: money },
    { title: "Deduction", dataIndex: "deduction", key: "deduction", align: "right", render: money },
    {
      title: "Adjustments",
      dataIndex: "adjustmentTotal",
      key: "adjustmentTotal",
      align: "right",
      render: (value) => (value ? money(value) : <Text type="secondary">—</Text>),
    },
    {
      title: "Net",
      dataIndex: "netAmount",
      key: "netAmount",
      align: "right",
      render: (value) => <span className="font-semibold">{money(value)}</span>,
    },
    {
      title: "Flags",
      key: "anomalies",
      render: (_value, row) =>
        row.anomalies.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space size={[4, 4]} wrap>
            {row.anomalies.map((anomaly) => {
              const shape = ANOMALY_TONE[anomaly.code] || { color: "default", label: anomaly.code };

              return (
                <Tooltip key={anomaly.code} title={anomaly.detail}>
                  <Tag color={shape.color} className="cursor-help">
                    {shape.label}
                  </Tag>
                </Tooltip>
              );
            })}
          </Space>
        ),
    },
    {
      title: "",
      key: "actions",
      render: (_value, row) =>
        // A correction only makes sense once a period is frozen — while it is
        // still a draft the right fix is to re-run it.
        status === "approved" || status === "paid" ? (
          <Button size="small" onClick={() => setAdjustingFor(row)}>
            Correct
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card size="small">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Pay run</span>
              {tone && <Tag color={tone.color}>{status}</Tag>}
            </div>
            <Text type="secondary" className="text-xs">
              {month.format("MMMM YYYY")}
              {tone ? ` · ${tone.help}` : " · no run generated for this period yet"}
            </Text>
          </div>

          <DatePicker
            picker="month"
            value={month}
            onChange={(value) => setMonth(value || dayjs())}
            allowClear={false}
            aria-label="Pay run month"
          />

          <Space wrap>
            <Button
              onClick={() => act(() => runPayrollDraft({ ...period, regenerate: true }), "Draft generated")}
              loading={isWorking}
              disabled={status === "approved" || status === "paid"}
            >
              {status ? "Regenerate draft" : "Generate draft"}
            </Button>
            <Button
              onClick={() => act(() => submitPeriodForReview(period), "Sent for review")}
              loading={isWorking}
              disabled={status !== "draft"}
            >
              Send for review
            </Button>
            <Popconfirm
              title="Approve this period?"
              description="Approving freezes every figure. Later attendance edits will not change it."
              okText="Approve"
              onConfirm={() => act(() => approvePeriod(period), "Period approved and frozen")}
              disabled={status !== "review"}
            >
              <Button type="primary" loading={isWorking} disabled={status !== "review"}>
                Approve
              </Button>
            </Popconfirm>
            <Button
              onClick={() => act(() => markPeriodPaid({ ...period }), "Marked paid")}
              loading={isWorking}
              disabled={status !== "approved"}
            >
              Mark paid
            </Button>
          </Space>
        </div>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      {review && (
        <div className="flex flex-wrap gap-4">
          <Card size="small" className="min-w-[140px]">
            <Statistic title="Employees" value={review.totals.employees} />
          </Card>
          <Card size="small" className="min-w-[140px]">
            <Statistic title="With a record" value={review.totals.withRecord} />
          </Card>
          <Card size="small" className="min-w-[140px]">
            <Statistic
              title="Flagged"
              value={review.totals.flagged}
              valueStyle={review.totals.flagged > 0 ? { color: "#c2410c" } : undefined}
            />
          </Card>
          <Card size="small" className="min-w-[160px]">
            <Statistic title="Total net" value={review.totals.net} prefix="₹" />
          </Card>
        </div>
      )}

      {status === "approved" || status === "paid" ? (
        <Alert
          type="info"
          showIcon
          message="This period is frozen."
          description="Its figures are stored on the record and no longer recomputed, so editing attendance for this month will not change anyone's pay. Corrections go on the next run."
        />
      ) : null}

      <Table
        rowKey="employeeId"
        dataSource={review?.rows || []}
        columns={columns}
        loading={isLoading}
        pagination={false}
        size="small"
        scroll={{ x: "max-content" }}
        locale={{
          emptyText: (
            <Empty description="No pay run for this period yet — generate a draft to begin." />
          ),
        }}
      />

      <Modal
        title="Raise a correction"
        open={Boolean(adjustingFor)}
        onOk={submitAdjustment}
        onCancel={() => {
          setAdjustingFor(null);
          form.resetFields();
        }}
        confirmLoading={isWorking}
        okText="Raise correction"
      >
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          message="History is not edited."
          description={`This becomes a labelled line on the following month's run, not a change to ${month.format("MMMM YYYY")}.`}
        />
        <Form form={form} layout="vertical" className="app-compact-form">
          <Form.Item label="Employee">
            <Input value={adjustingFor?.name || ""} disabled />
          </Form.Item>
          <Form.Item
            label="Amount"
            name="amount"
            extra="Negative claws back an overpayment; positive pays a shortfall."
            rules={[{ required: true, message: "An amount is required" }]}
          >
            <InputNumber style={{ width: "100%" }} prefix="₹" />
          </Form.Item>
          <Form.Item
            label="Reason"
            name="reason"
            rules={[{ required: true, message: "A reason is required" }]}
          >
            <Input.TextArea rows={2} placeholder="e.g. Roster mark was wrong on the 14th" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PayrollRunReview;
