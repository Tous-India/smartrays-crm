import { Segmented, DatePicker } from "antd";
import dayjs from "dayjs";
import { ANALYTICS_DATE_FILTER_OPTIONS } from "../utils/analyticsDateFilters";

const { RangePicker } = DatePicker;
const DATE_FORMAT = "YYYY-MM-DD";

/**
 * The one shared date-range control for every trend chart on the Reports
 * page — same Segmented-tabs pattern as `PaymentsListPage`'s date filter,
 * plus a `RangePicker` that only appears for the "Custom Range" preset.
 */
function DateRangeFilter({ activeFilter, onFilterChange, customRange, onCustomRangeChange }) {
  const customValue =
    customRange?.from && customRange?.to ? [dayjs(customRange.from), dayjs(customRange.to)] : null;

  function handleCustomChange(dates) {
    if (!dates) {
      onCustomRangeChange({ from: "", to: "" });
      return;
    }

    onCustomRangeChange({ from: dates[0].format(DATE_FORMAT), to: dates[1].format(DATE_FORMAT) });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        value={activeFilter}
        onChange={onFilterChange}
        options={ANALYTICS_DATE_FILTER_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
      />
      {activeFilter === "custom" && <RangePicker value={customValue} onChange={handleCustomChange} allowClear />}
    </div>
  );
}

export default DateRangeFilter;
