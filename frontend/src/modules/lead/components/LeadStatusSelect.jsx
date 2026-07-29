import { Select } from "antd";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_PASTEL_COLORS } from "../constants/lead.constants";

// Each option carries its own pastel tint as the same `--lead-status-pastel-bg`
// custom property the closed selector uses below (styles/index.css consumes
// it for both) — so the open dropdown's per-row backgrounds stay derived from
// `LEAD_STATUS_PASTEL_COLORS` too, rather than a second hardcoded CSS mapping.
const STATUS_OPTIONS = LEAD_STATUSES.map((status) => ({
  value: status,
  label: LEAD_STATUS_LABELS[status],
  style: { "--lead-status-pastel-bg": LEAD_STATUS_PASTEL_COLORS[status] },
}));

/**
 * The inline status dropdown used in the Table view's row and the Detail
 * page — never sets status directly. `onRequestChange` always goes through
 * `useLeadStatusChangeFlow`, since `lost`/`won` need an extra step first.
 *
 * Background is a soft pastel tint per stage (`LEAD_STATUS_PASTEL_COLORS`,
 * lead.constants.js — derived from the same `LEAD_STATUS_COLORS` map the
 * read-only Tag badge uses, so the two can't drift apart). Set via a CSS
 * custom property + `.lead-status-select` (styles/index.css) rather than a
 * plain `style.backgroundColor`, since AntD's actual visible box is the
 * inner `.ant-select-selector`, not the outer element a `style` prop reaches.
 *
 * The open dropdown menu is portaled to <body>, outside `.lead-status-select`,
 * so it needs its own hook (`classNames.popup.root`) to reach it — AntD's own
 * default "selected option" background (derived from the navy brand primary,
 * see App.jsx#BRAND_THEME) renders as a dark grey-blue block that reads as an
 * inconsistent, out-of-place highlight against the pastel-per-stage theme, so
 * every state (default/hover/selected) gets its own explicit background and
 * text color here instead of inheriting that default.
 */
function LeadStatusSelect({ lead, disabled, onRequestChange }) {
  return (
    <Select
      value={lead.status}
      options={STATUS_OPTIONS}
      disabled={disabled}
      size="small"
      style={{ minWidth: 126, "--lead-status-pastel-bg": LEAD_STATUS_PASTEL_COLORS[lead.status] }}
      className="lead-status-select"
      classNames={{ popup: { root: "lead-status-select-dropdown" } }}
      onClick={(event) => event.stopPropagation()}
      onChange={(newStatus) => onRequestChange(lead, newStatus)}
    />
  );
}

export default LeadStatusSelect;
