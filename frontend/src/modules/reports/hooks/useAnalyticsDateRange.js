import { useState } from "react";
import { computeAnalyticsDateRange } from "../utils/analyticsDateFilters";

/**
 * Owns the Reports page's one shared date-range filter state — every
 * trend chart section reads `dateRange` from this same hook instance so
 * they all move together.
 */
export function useAnalyticsDateRange(defaultKey = "thisMonth") {
  const [activeFilter, setActiveFilter] = useState(defaultKey);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });

  const dateRange = computeAnalyticsDateRange(activeFilter, customRange);

  return { activeFilter, setActiveFilter, customRange, setCustomRange, dateRange };
}

export default useAnalyticsDateRange;
