import { Select } from "antd";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_PASTEL_COLORS } from "../constants/lead.constants";

const STATUS_OPTIONS = LEAD_STATUSES.map((status) => ({
  value: status,
  label: LEAD_STATUS_LABELS[status],
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
 */
function LeadStatusSelect({ lead, disabled, onRequestChange }) {
  return (
    <Select
      value={lead.status}
      options={STATUS_OPTIONS}
      disabled={disabled}
      size="small"
      style={{ minWidth: 140, "--lead-status-pastel-bg": LEAD_STATUS_PASTEL_COLORS[lead.status] }}
      className="lead-status-select"
      onClick={(event) => event.stopPropagation()}
      onChange={(newStatus) => onRequestChange(lead, newStatus)}
    />
  );
}

export default LeadStatusSelect;
