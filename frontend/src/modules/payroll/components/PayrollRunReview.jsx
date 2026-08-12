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
import { money } from "../../../utils/currency.utils";
import { generateReport, triggerBlobDownload } from "../../../services/reportApi";
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



/**
 * A bonus / other-deduction cell.
 *
 * Editable only while the run is OPEN. Once approved every cell here is
 * read-only — the freeze is the whole point of that state, and a cell that
 * still looked editable would be promising something the server would refuse.
 */
function AdjustmentCell({ row, amount, editable, onEdit }) {
  const shown = amount ? money(amount) : <Text type="secondary">—</Text>;

  if (!editable || !row.payrollId) {
    return <span className="whitespace-nowrap">{shown}</span>;
  }

  return (
    <Button type="link" size="small" className="!px-0" onClick={onEdit}>
      {amount ? money(amount) : "Add"}
    </Button>
  );
}

function PayrollRunReview({ month: monthProp, year: yearProp, onChanged }) {
  // Driven by the period the `/payroll` page opened (§7.57). The internal
  // picker remains only for the standalone case, so this component still works
  // on its own rather than depending on a parent to exist.
  const [month, setMonth] = useState(() =>
    monthProp && yearProp ? dayjs().year(yearProp).month(monthProp - 1) : dayjs().subtract(1, "month")
  );
  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState(null);
  const [adjustingFor, setAdjustingFor] = useState(null);
  const [search, setSearch] = useState("");
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

  useEffect(() => {
    if (monthProp && yearProp) {
      setMonth(dayjs().year(yearProp).month(monthProp - 1));
    }
  }, [monthProp, yearProp]);

  /** PDF / Excel through the shared report dispatcher, run-scoped. */
  async function exportRun(format) {
    try {
      // The dispatcher STREAMS the file rather than returning a URL, so this
      // goes through the same blob-download helper every other export uses.
      const response = await generateReport({
        module: "payrollRun",
        format,
        filters: { month: period.month, year: period.year },
      });

      triggerBlobDownload(
        response.data,
        `pay-run-${period.year}-${String(period.month).padStart(2, "0")}.${format}`
      );
    } catch (requestError) {
      message.error(requestError.response?.data?.message || "Could not export this run.");
    }
  }

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
    // The form always takes a positive number; the COLUMN decides the sign, so
    // nobody has to remember that a deduction is negative.
    const magnitude = Math.abs(values.amount);
    const amount = adjustingFor.intent === "deduction" ? -magnitude : magnitude;

    await act(
      () =>
        createAdjustment({
          ...period,
          employeeId: adjustingFor.employeeId,
          amount,
          reason: values.reason,
        }),
      isOpen ? "Added to this run" : "Correction raised — it will appear on the next run"
    );

    setAdjustingFor(null);
    form.resetFields();
    onChanged?.();
  }

  const status = review?.status || null;
  const tone = status ? STATUS_TONE[status] : null;
  // Open == still changeable. Everything editable on this screen is gated on
  // it, so "approved" makes the whole table read-only in one place rather than
  // per control.
  const isOpen = status === "draft" || status === "review";

  const columns = [
    {
      title: "Employee",
      dataIndex: "name",
      key: "name",
      fixed: "left",
      render: (name) => <span className="font-medium">{name}</span>,
    },
    {
      title: "Base Salary",
      dataIndex: "grossAmount",
      key: "grossAmount",
      align: "right",
      render: money,
    },
    // "Days in Month" is a property of the PERIOD, not of an employee — it is
    // the same number on every row. It lives in the run header instead of
    // costing a column that says nothing per row.
    {
      title: "Paid Days",
      dataIndex: "paidDays",
      key: "paidDays",
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
      title: "LOP Days",
      dataIndex: "unpaidDeductionDays",
      key: "unpaidDeductionDays",
      align: "right",
      render: (value) => (value == null ? "—" : value),
    },
    {
      // The split is ALWAYS shown where a surcharge exists, never a bare "×2".
      // "×2" read as though the whole figure had been doubled; it had not —
      // the doubling applied to a fraction of a day. Spelling out
      // "₹4,645 + ₹516 (0.5 day absence, 2×)" is also what makes the
      // paidDays/net gap explainable from the row itself.
      title: "LOP Deduction",
      dataIndex: "deduction",
      key: "deduction",
      align: "right",
      render: (value, row) => (
        <span className="inline-flex flex-col items-end leading-tight">
          <span>{money(value)}</span>
          {row.surchargeAmount > 0 && (
            <Text type="secondary" className="whitespace-nowrap text-[11px]">
              {money(row.absenceAmount)} + {money(row.surchargeAmount)} (
              {row.doubleDeductionDays} day absence, 2×)
            </Text>
          )}
        </span>
      ),
    },
    {
      title: "Bonus",
      key: "bonus",
      align: "right",
      render: (_value, row) => (
        <AdjustmentCell
          row={row}
          amount={row.bonusTotal}
          editable={isOpen}
          onEdit={() => setAdjustingFor({ ...row, intent: "bonus" })}
        />
      ),
    },
    {
      title: "Other Deductions",
      key: "otherDeductions",
      align: "right",
      render: (_value, row) => (
        <AdjustmentCell
          row={row}
          amount={row.otherDeductionTotal}
          editable={isOpen}
          onEdit={() => setAdjustingFor({ ...row, intent: "deduction" })}
        />
      ),
    },
    {
      title: "Net Payable",
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
        isOpen ? null : (
          <Space size={4}>
            {/* A payslip only exists once the figures are final — a draft 409s
                by design, so the link is not offered there. */}
            {row.payrollId && (
              <Button
                size="small"
                type="link"
                className="!px-0"
                href={`${import.meta.env.VITE_API_BASE_URL || ""}/payroll/${row.payrollId}/payslip`}
                target="_blank"
                rel="noreferrer"
              >
                Payslip
              </Button>
            )}
            {row.payrollId && (
              <Button size="small" onClick={() => setAdjustingFor({ ...row, intent: "correction" })}>
                Correct
              </Button>
            )}
          </Space>
        ),
    },
  ];

  // Employee search. Filtering the ROWS rather than asking the server keeps the
  // totals honest: they are the run's totals, not the filtered subset's, and
  // the header says which.
  const visibleRows = (review?.rows || []).filter((row) =>
    row.name.toLowerCase().includes(search.trim().toLowerCase())
  );

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
              {month.format("MMMM YYYY")} · {month.daysInMonth()} days in month
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

          {/* Filters the ROWS only. The totals stay the run's totals rather
              than the filtered subset's — a search box must not quietly change
              what an admin is about to approve. */}
          <Input.Search
            allowClear
            placeholder="Find an employee"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: 200 }}
            aria-label="Find an employee"
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
              title="Finalise this run?"
              description="Approving freezes every figure. Later attendance edits will not change it."
              okText="Approve"
              onConfirm={() => act(() => approvePeriod(period), "Period approved and frozen")}
              disabled={status !== "review"}
            >
              <Button type="primary" loading={isWorking} disabled={status !== "review"}>
                Finalise
              </Button>
            </Popconfirm>
            <Button
              onClick={() => act(() => markPeriodPaid({ ...period }), "Marked paid")}
              loading={isWorking}
              disabled={status !== "approved"}
            >
              Mark paid
            </Button>
            {/* The existing shared report service, run-scoped and gated on
                `payroll.run`. Not a second export. */}
            <Button onClick={() => exportRun("pdf")} disabled={!status}>
              PDF
            </Button>
            <Button onClick={() => exportRun("xlsx")} disabled={!status}>
              Excel
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
        dataSource={visibleRows}
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
        // An admin approving a run needs the aggregate, not just the rows.
        // Every figure is the server's own total, so the row cannot drift from
        // what the run actually holds.
        summary={() =>
          review && review.totals.withRecord > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row className="font-semibold">
                <Table.Summary.Cell index={0}>
                  {review.totals.employees} employees
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} />
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} />
                <Table.Summary.Cell index={4} align="right">
                  {money(review.totals.gross)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  {money(review.totals.deduction)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  {money(review.totals.bonus)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  {money(review.totals.otherDeductions)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  {money(review.totals.net)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} />
                <Table.Summary.Cell index={10} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />

      <Modal
        title={
          adjustingFor?.intent === "bonus"
            ? "Add a bonus"
            : adjustingFor?.intent === "deduction"
              ? "Add a deduction"
              : "Raise a correction"
        }
        open={Boolean(adjustingFor)}
        onOk={submitAdjustment}
        onCancel={() => {
          setAdjustingFor(null);
          form.resetFields();
        }}
        confirmLoading={isWorking}
        okText={
          adjustingFor?.intent === "bonus"
            ? "Add bonus"
            : adjustingFor?.intent === "deduction"
              ? "Add deduction"
              : "Raise correction"
        }
      >
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          message={isOpen ? "This is a line on this run." : "History is not edited."}
          description={
            isOpen
              ? `Recorded as an adjustment on ${month.format("MMMM YYYY")}. The computed salary figures are not touched.`
              : `This becomes a labelled line on the following month's run, not a change to ${month.format("MMMM YYYY")}.`
          }
        />
        <Form form={form} layout="vertical" className="app-compact-form">
          <Form.Item label="Employee">
            <Input value={adjustingFor?.name || ""} disabled />
          </Form.Item>
          <Form.Item
            label="Amount"
            name="amount"
            extra={
              adjustingFor?.intent === "deduction"
                ? "Entered as a positive figure; it is deducted."
                : adjustingFor?.intent === "bonus"
                  ? "Entered as a positive figure; it is added."
                  : "Negative claws back an overpayment; positive pays a shortfall."
            }
            rules={[{ required: true, message: "An amount is required" }]}
          >
            <InputNumber style={{ width: "100%" }} prefix="₹" min={0} />
          </Form.Item>
          {/*
            A reason is mandatory, the same discipline manual attendance marks
            follow (§7.4h). An amount on somebody's pay with no stated reason is
            exactly what an audit needs and would not have.
          */}
          <Form.Item
            label="Reason"
            name="reason"
            rules={[{ required: true, message: "A reason is required" }]}
          >
            <Input.TextArea rows={2} placeholder="e.g. Diwali bonus, or equipment recovery" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PayrollRunReview;
