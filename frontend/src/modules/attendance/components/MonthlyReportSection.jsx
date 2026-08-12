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

/**
 * Whether a row shows the ×2 marker at all.
 *
 * The marker explains why a DEDUCTION is bigger than its day count implies, so
 * it is keyed on there being a non-zero deduction to explain — not merely on
 * the underlying leave record existing. It fired on a zero row for two separate
 * reasons, and both mattered:
 *
 *  1. `doubleDeductionDays` comes from the LEAVE collection while Absent and
 *     Unpaid Leave come from ATTENDANCE, and `markUnapprovedAbsence` writes no
 *     attendance record at all. The leave row said "unapproved absence" while
 *     every visible column on the same line said zero, so the marker pointed at
 *     nothing. (The calculator now reconciles the two per date, so the absence
 *     shows up in its own columns too.)
 *  2. An employee with no base salary has a null deduction rendered as "—", and
 *     the marker sat beside it — "—×2" claims a doubling of an unknown figure.
 *
 * One predicate, used by both the cell and the footnote, so the two can never
 * disagree about whether a ×2 is on screen.
 */
export function showsDoubleMarker(row) {
  return row.deduction > 0 && row.doubleDeductionDays > 0;
}

/**
 * Column-group tints (§7.51) — THREE for ten columns, not ten.
 *
 * The tint says what KIND of column this is, so the table reads as three
 * blocks: what you are owed, what you used, what it costs. Employee is the
 * anchor and stays untinted, which is what makes the blocks visible either side
 * of it.
 *
 * Never by value: Deduction and Net Payable carry the SAME tint on purpose. A
 * red deduction or a green net payable would have the table pass judgement on
 * someone's pay, which is not its job.
 *
 * Applied to header AND body cells through `onHeaderCell`/`onCell`, so a column
 * cannot end up tinted in one and not the other. Colours live in
 * `styles/index.css` beside the other registered families.
 */
const GROUP = {
  entitlement: "report-col-entitlement",
  consumption: "report-col-consumption",
  money: "report-col-money",
};

/** Both cell hooks from one group name, so they can never disagree. */
function tint(group) {
  const className = GROUP[group];

  return { onHeaderCell: () => ({ className }), onCell: () => ({ className }) };
}

/**
 * A header with its basis on a second line (2026-08-12).
 *
 * Base Salary is a MONTHLY figure, and nothing on this table said so. It sits
 * in the same money group as Deduction and Net Payable, which are monthly by
 * construction, and a reader who assumed an annual salary would read every
 * figure in that group as inconsistent.
 *
 * A second LINE rather than a longer title, because the ten columns fit 1280
 * with zero pixels to spare (980px of columns in a 980px holder) — widening a
 * header would push the table into an internal scroll. "(monthly)" is narrower
 * than the title above it, so the column cannot grow.
 */
function basisHeader(title, basis) {
  return (
    <span className="inline-flex flex-col leading-tight">
      <span>{title}</span>
      <Text type="secondary" className="text-[11px] font-normal">
        {basis}
      </Text>
    </span>
  );
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

  const hasDoubleDeduction = rows.some(showsDoubleMarker);
  const leaveYear = rows[0]?.leaveYear;

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
      // was agreed, the other what this month works out to. Both now carry
      // "(monthly)" so the shared basis is visible, not inferred.
      title: basisHeader("Base Salary", "(monthly)"),
      dataIndex: "baseSalary",
      key: "baseSalary",
      align: "right",
      ...tint("money"),
      render: (value) =>
        value == null ? (
          <Tooltip title="No base salary recorded for this employee">
            <Text type="secondary">—</Text>
          </Tooltip>
        ) : (
          money(value)
        ),
    },
    // §7.49 — the annual paid-leave balance, in three parts so the arithmetic
    // on the row reads as arithmetic: what was left coming in, what this month
    // adds, and what is left going out. All three are DERIVED from year-to-date
    // approved paid leave; nothing is stored, so there is no balance field that
    // can drift away from the leave records themselves.
    //
    // This is not a spendable pot. §11.7's approval rule is untouched — still
    // at most one paid day per calendar month, no carry-forward. Twelve is
    // simply what one-a-month adds up to over a year.
    {
      title: "Old Balance",
      dataIndex: "oldBalance",
      key: "oldBalance",
      align: "right",
      ...tint("entitlement"),
      render: days,
    },
    {
      title: "This Month Credit",
      dataIndex: "monthCredit",
      key: "monthCredit",
      align: "right",
      ...tint("entitlement"),
      render: days,
    },
    {
      // No Present column (§7.50) — this is a leave report, not an attendance
      // report. The backend still returns `presentDays` because Payroll derives
      // gross pay from it; it simply has no place on this table.
      //
      // "Absent" here means LEAVE DAYS TAKEN, counted from approved leave
      // records only. A roster-marked absence with no leave record behind it is
      // an attendance fact and does not appear. The subheading says so, because
      // a column called "Absent" on a page called Attendance will otherwise be
      // read as the attendance number.
      title: "Absent",
      dataIndex: "absentDays",
      key: "absentDays",
      align: "right",
      ...tint("consumption"),
      render: days,
    },
    {
      title: "Paid Leave",
      dataIndex: "paidLeave",
      key: "paidLeave",
      align: "right",
      ...tint("consumption"),
      render: days,
    },
    {
      title: "Unpaid Leave",
      dataIndex: "unpaidLeave",
      key: "unpaidLeave",
      align: "right",
      ...tint("consumption"),
      render: days,
    },
    {
      title: "Deduction",
      dataIndex: "deduction",
      key: "deduction",
      align: "right",
      ...tint("money"),
      // A doubled deduction does NOT match the day count, and a figure that
      // silently disagrees with the row beside it reads as a bug. The marker
      // says which rows are doubled and why, rather than leaving the reader to
      // work out the arithmetic.
      // See `showsDoubleMarker` for why the marker is gated on the deduction
      // rather than on the leave record alone.
      render: (value, row) => (
        <span className="whitespace-nowrap">
          {money(value)}
          {showsDoubleMarker(row) && (
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
      // Derived, unlike "Base Salary" above — but on the SAME monthly basis,
      // which is the point of repeating it here.
      title: basisHeader("Net Payable", "(monthly)"),
      dataIndex: "netPayable",
      key: "netPayable",
      align: "right",
      ...tint("money"),
      render: (value) => <span className="font-semibold">{money(value)}</span>,
    },
    {
      // Last, deliberately: it closes the row the way Old Balance opens it.
      title: "Balance",
      dataIndex: "balance",
      key: "balance",
      align: "right",
      ...tint("entitlement"),
      render: days,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card size="small">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* `flex-1 min-w-0` lets the (now longer) subheading wrap INSIDE this
              block rather than widening it until the filter control is pushed
              onto a row of its own. min-w-0 is what actually permits a flex
              child to shrink below its content width. */}
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Monthly Report</div>
            <Text type="secondary" className="text-xs">
              {month.format("MMMM YYYY")} · <strong>Absent counts leave days</strong>, not
              roster-marked attendance · per-day rate is the <strong>monthly</strong> base salary ÷{" "}
              {month.daysInMonth()} calendar days
              {/* Which year the balance is measured against — the backend
                  reports it rather than the UI re-deriving a boundary that is
                  defined once in the shared service. */}
              {leaveYear && ` · balance is out of 12 for the ${leaveYear} leave year (Jan–Dec)`}
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
        className="app-report-table"
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
