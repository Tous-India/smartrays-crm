import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Alert, Card, DatePicker, Segmented, Table, Tooltip, Typography } from "antd";
import { getMonthlyReport } from "../../payroll/api/payrollApi";

const { Text } = Typography;

/**
 * The monthly leave-and-attendance report (§7.47, 2026-08-11) — one row per
 * employee, per calendar month.
 *
 * SEPARATE from the "Download Report" button on the Attendance tab, on
 * purpose. That exports the raw attendance records for a date range; this
 * summarises a whole month into salary figures. Merging them would give one
 * control two unrelated meanings.
 *
 * **Every number here comes from the backend's shared calculator**
 * (`salaryCalculation.service.js`) — nothing is recomputed in this file. The
 * Payroll module computes the same figures from that same service, so the two
 * cannot drift apart into a disputed payslip. This component's whole job is
 * rendering, and adding "just one" division here would defeat the point.
 *
 * LEAVE MODEL (§11.7): ONE paid leave day per calendar month, no carry-forward
 * and no accumulated balance. There is deliberately no opening balance, no
 * monthly credit and no closing balance column — no such thing exists in this
 * system.
 */

const MONTH_FILTERS = [
  { value: "current", label: "This month" },
  { value: "previous", label: "Last month" },
  { value: "custom", label: "Custom month" },
];

/** `₹1,935`, or an em dash — never `₹0` standing in for "not recorded". */
function money(value) {
  return value == null ? "—" : `₹${value.toLocaleString()}`;
}

/** Trims 1.0 to "1" but keeps 1.5 as "1.5", so half days stay visible. */
function days(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function resolveMonth(filter, customMonth) {
  if (filter === "previous") {
    return dayjs().subtract(1, "month");
  }

  if (filter === "custom" && customMonth) {
    return customMonth;
  }

  return dayjs();
}

function MonthlyReportSection() {
  const [filter, setFilter] = useState("current");
  // Held as a dayjs value, not an ISO string — AntD's DatePicker requires one
  // and silently renders empty otherwise.
  const [customMonth, setCustomMonth] = useState(dayjs());
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const month = useMemo(() => resolveMonth(filter, customMonth), [filter, customMonth]);
  const year = month.year();
  const monthNumber = month.month() + 1;

  useEffect(() => {
    let isStale = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getMonthlyReport({ year, month: monthNumber });

        if (!isStale) {
          setRows(response.data.data.rows || []);
        }
      } catch (requestError) {
        if (!isStale) {
          setError(
            requestError.response?.data?.message || "Could not load the report. Please try again."
          );
          setRows([]);
        }
      } finally {
        if (!isStale) {
          setIsLoading(false);
        }
      }
    }

    load();

    // A slow response for a month the user has already navigated away from
    // must not overwrite the one they are now looking at.
    return () => {
      isStale = true;
    };
  }, [year, monthNumber]);

  // Keyed on what is actually VISIBLE, not on the underlying data: a row with
  // no salary renders "—" and suppresses its marker, so counting it here left
  // a footnote explaining a ×2 that appeared nowhere on screen.
  const hasDoubleDeduction = rows.some(
    (row) => row.deduction != null && row.doubleDeductionDays > 0
  );

  const columns = [
    {
      title: "Employee",
      dataIndex: "name",
      key: "name",
      // min-w-0 is what actually lets `truncate` work inside a flex/table cell.
      render: (name) => <span className="min-w-0 font-medium">{name}</span>,
    },
    {
      // "Base Salary" is the STORED monthly figure. Deliberately worded
      // differently from "Net Payable" below, which is derived — one is what
      // was agreed, the other what this month works out to.
      title: "Base Salary",
      dataIndex: "baseSalary",
      key: "baseSalary",
      align: "right",
      render: (value) =>
        value == null ? (
          <Tooltip title="No base salary recorded for this employee">
            <Text type="secondary">—</Text>
          </Tooltip>
        ) : (
          money(value)
        ),
    },
    {
      title: "Present",
      dataIndex: "presentDays",
      key: "presentDays",
      align: "right",
      render: days,
    },
    {
      title: "Absent",
      dataIndex: "absentDays",
      key: "absentDays",
      align: "right",
      render: days,
    },
    {
      title: "Paid Leave",
      dataIndex: "paidLeave",
      key: "paidLeave",
      align: "right",
      render: days,
    },
    {
      title: "Unpaid Leave",
      dataIndex: "unpaidLeave",
      key: "unpaidLeave",
      align: "right",
      render: days,
    },
    {
      title: "Deduction",
      dataIndex: "deduction",
      key: "deduction",
      align: "right",
      // A doubled deduction does NOT match the day count, and a figure that
      // silently disagrees with the row beside it reads as a bug. The marker
      // says which rows are doubled and why, rather than leaving the reader to
      // work out the arithmetic.
      //
      // The marker is suppressed when there is no deduction to explain: an
      // employee with no base salary renders "—", and "—×2" claimed a doubling
      // of an unknown figure. Seen in the browser on real data.
      render: (value, row) => (
        <span className="whitespace-nowrap">
          {money(value)}
          {value != null && row.doubleDeductionDays > 0 && (
            <Tooltip
              title={`Includes ${days(row.doubleDeductionDays)} unapproved absence day(s), deducted at 2× (§7.5)`}
            >
              <Text type="danger" className="ml-1 cursor-help font-semibold">
                ×2
              </Text>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      // Derived, unlike "Base Salary" above.
      title: "Net Payable",
      dataIndex: "netPayable",
      key: "netPayable",
      align: "right",
      render: (value) => <span className="font-semibold">{money(value)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card size="small">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="font-semibold">Monthly Report</div>
            <Text type="secondary" className="text-xs">
              {month.format("MMMM YYYY")} · per-day rate is the base salary ÷ {month.daysInMonth()}{" "}
              calendar days
            </Text>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* `value` is always passed — Segmented preselects its first option
                when it is undefined, which would show "This month" selected
                while a different month was actually loaded. */}
            <Segmented
              value={filter}
              onChange={setFilter}
              options={MONTH_FILTERS}
              aria-label="Report month"
            />
            {filter === "custom" && (
              <DatePicker
                picker="month"
                value={customMonth}
                onChange={(value) => setCustomMonth(value || dayjs())}
                allowClear={false}
                aria-label="Choose month"
              />
            )}
          </div>
        </div>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      <Table
        rowKey="employeeId"
        dataSource={rows}
        columns={columns}
        loading={isLoading}
        pagination={false}
        size="small"
        // No `scroll={{ y }}` — that prop is what creates the inner
        // `.ant-table-body` scroll container, and an inner scrollbar on a
        // report you read top to bottom means two scrollbars fighting
        // (a991e21). The table renders its full height; the page scrolls.
        //
        // `scroll={{ x }}` IS set, and is the opposite case: eight columns of
        // figures cannot fit 390px, and without it the whole PAGE scrolled
        // sideways — measured at scrollWidth 557 against a 391 client width,
        // while the Attendance and Leave Requests tabs both sat at 391/391. A
        // horizontal scroll belongs to the table that is too wide, not to the
        // page around it.
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No employees to report on for this month." }}
      />

      {hasDoubleDeduction && (
        <Text type="secondary" className="text-xs">
          ×2 — an unapproved absence is deducted at twice the per-day rate (§7.5), so the deduction
          on that row is larger than its absent-day count alone would suggest.
        </Text>
      )}
    </div>
  );
}

export default MonthlyReportSection;
