import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Modal,
  Select,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { money } from "../../../utils/currency.utils";
import { getPayrollPeriods, runPayrollDraft } from "../api/payrollApi";
import PayrollRunReview from "./PayrollRunReview";

const { Text } = Typography;

/**
 * `/payroll` — the pay run index (§7.57, 2026-08-12).
 *
 * ONE entry point. A year dropdown lists that year's runs, a month per row;
 * clicking a row opens the review table for that run. The month/year picker
 * exists only inside the "Run payroll" modal launched from here — there is no
 * second way in, which is what keeps "which run am I looking at" answerable.
 *
 * **Months with no run are rows, not omissions.** A payroll that silently
 * skipped March is exactly what a list of runs exists to catch; leaving the
 * month out would hide the one thing worth seeing.
 *
 * Every figure is a sum of what a run already stored. Nothing here computes
 * salary — that is `salaryCalculation.service.js`'s job and only its job.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_TONE = {
  draft: { color: "default", help: "Regenerates freely. Not payable." },
  review: { color: "processing", help: "Being checked. Not frozen." },
  approved: { color: "success", help: "Frozen — figures cannot change." },
  paid: { color: "green", help: "Recorded as paid." },
};



function PayrollYearView() {
  const [year, setYear] = useState(() => dayjs().year());
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openRun, setOpenRun] = useState(null);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [runMonth, setRunMonth] = useState(() => dayjs());
  const [isRunning, setIsRunning] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getPayrollPeriods({ year });
      setData(response.data.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load pay runs.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const existingRun = useMemo(
    () =>
      (data?.rows || []).find(
        (row) => row.month === runMonth.month() + 1 && row.year === runMonth.year() && row.status
      ) || null,
    [data, runMonth]
  );

  const yearOptions = useMemo(() => {
    const years = data?.years?.length ? data.years : [dayjs().year()];

    return years.map((one) => ({ value: one, label: String(one) }));
  }, [data]);

  async function runPayroll() {
    setIsRunning(true);

    try {
      await runPayrollDraft({
        year: runMonth.year(),
        month: runMonth.month() + 1,
        regenerate: true,
      });
      message.success(`Draft generated for ${runMonth.format("MMMM YYYY")}`);
      setIsRunModalOpen(false);

      // Follow the run that was just generated, even into another year.
      if (runMonth.year() !== year) setYear(runMonth.year());
      else await load();
    } catch (requestError) {
      // The endpoint 409s on an approved period. Surfacing the server's own
      // message matters here: "already approved" is the useful sentence, and
      // swallowing it would make the button look broken rather than refused.
      message.error(
        requestError.response?.data?.message || "Could not generate the draft."
      );
    } finally {
      setIsRunning(false);
    }
  }

  const columns = [
    {
      title: "Month",
      dataIndex: "month",
      key: "month",
      render: (month, row) => (
        <span className={row.status ? "font-medium" : "text-gray-400"}>{MONTH_NAMES[month - 1]}</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) =>
        status ? (
          <Tag color={STATUS_TONE[status]?.color}>{status}</Tag>
        ) : (
          <Text type="secondary">No run</Text>
        ),
    },
    {
      title: "Employees",
      dataIndex: "employeeCount",
      key: "employeeCount",
      align: "right",
      render: (value, row) => (row.status ? value : <Text type="secondary">—</Text>),
    },
    {
      title: "Gross",
      dataIndex: "grossTotal",
      key: "grossTotal",
      align: "right",
      render: (value, row) => (row.status ? money(value) : <Text type="secondary">—</Text>),
    },
    {
      title: "Deductions",
      dataIndex: "deductionTotal",
      key: "deductionTotal",
      align: "right",
      render: (value, row) => (row.status ? money(value) : <Text type="secondary">—</Text>),
    },
    {
      title: "Net",
      dataIndex: "netTotal",
      key: "netTotal",
      align: "right",
      render: (value, row) =>
        row.status ? <span className="font-semibold">{money(value)}</span> : <Text type="secondary">—</Text>,
    },
    {
      title: "Generated",
      dataIndex: "generatedAt",
      key: "generatedAt",
      render: (value) =>
        value ? dayjs(value).format("D MMM YYYY, HH:mm") : <Text type="secondary">—</Text>,
    },
    {
      title: "Generated by",
      dataIndex: "generatedBy",
      key: "generatedBy",
      // A null actor renders "—", NEVER "Automatic (cron)". node-cron does not
      // execute on Vercel serverless, so no run has ever been cron-generated;
      // labelling null as automatic would assert something false about records
      // written before the field existed.
      render: (value) => value || <Text type="secondary">—</Text>,
    },
    {
      title: "Approved / Paid",
      key: "actor",
      render: (_value, row) => {
        if (row.paidAt) {
          return (
            <Text type="secondary" className="text-xs">
              Paid {dayjs(row.paidAt).format("D MMM YYYY")}
            </Text>
          );
        }

        if (row.approvedAt) {
          return (
            <Text type="secondary" className="text-xs">
              {row.approvedBy || "—"} · {dayjs(row.approvedAt).format("D MMM YYYY")}
            </Text>
          );
        }

        return <Text type="secondary">—</Text>;
      },
    },
  ];

  if (openRun) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setOpenRun(null)}>← All pay runs</Button>
          <span className="font-semibold">
            {MONTH_NAMES[openRun.month - 1]} {openRun.year}
          </span>
        </div>
        {/* The review table built in §7.54 — reused, not rebuilt. */}
        <PayrollRunReview month={openRun.month} year={openRun.year} onChanged={load} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="small">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Pay runs</div>
            <Text type="secondary" className="text-xs">
              One row per month. A month with no run is still listed, so a missed period is visible.
            </Text>
          </div>

          <Select
            value={year}
            onChange={setYear}
            options={yearOptions}
            style={{ width: 120 }}
            aria-label="Payroll year"
          />

          <Button type="primary" onClick={() => setIsRunModalOpen(true)}>
            Run payroll
          </Button>
        </div>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      <Table
        rowKey="month"
        dataSource={data?.rows || []}
        columns={columns}
        loading={isLoading}
        pagination={false}
        size="small"
        // No `scroll={{ y }}` — an inner scrollbar on a 12-row list means two
        // scrollbars fighting. `scroll={{ x }}` handles narrow widths.
        scroll={{ x: "max-content" }}
        onRow={(row) => ({
          onClick: () => row.status && setOpenRun({ month: row.month, year: row.year }),
          className: row.status ? "cursor-pointer" : undefined,
        })}
        locale={{ emptyText: <Empty description={`No pay runs in ${year} yet.`} /> }}
      />

      <Modal
        title="Run payroll"
        open={isRunModalOpen}
        onOk={runPayroll}
        onCancel={() => setIsRunModalOpen(false)}
        confirmLoading={isRunning}
        okText="Generate draft"
      >
        <Alert
          type={existingRun ? "warning" : "info"}
          showIcon
          className="!mb-4"
          message={existingRun ? `A run already exists for ${runMonth.format("MMMM YYYY")}.` : "This generates a DRAFT."}
          description={
            existingRun?.status === "approved" || existingRun?.status === "paid"
              ? `That run is ${existingRun.status} and frozen — this will be REFUSED. Corrections go on the next run.`
              : existingRun
                ? "Re-running REPLACES the existing draft in place; it does not create a second one. Adjustments already raised are re-collected, not lost."
                : "A draft can be regenerated as often as you like. An approved run is frozen and will be refused."
          }
        />
        <div className="flex flex-col gap-2">
          <Text>Period</Text>
          <DatePicker
            picker="month"
            value={runMonth}
            onChange={(value) => setRunMonth(value || dayjs())}
            allowClear={false}
            aria-label="Payroll period"
          />
        </div>
      </Modal>
    </div>
  );
}

export default PayrollYearView;
