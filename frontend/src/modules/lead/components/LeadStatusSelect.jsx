import { Select } from "antd";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "../constants/lead.constants";

const STATUS_OPTIONS = LEAD_STATUSES.map((status) => ({
  value: status,
  label: LEAD_STATUS_LABELS[status],
}));

/**
 * The inline status dropdown used in the Table view's row and the Detail
 * page — never sets status directly. `onRequestChange` always goes through
 * `useLeadStatusChangeFlow`, since `lost`/`won` need an extra step first.
 */
function LeadStatusSelect({ lead, disabled, onRequestChange }) {
  return (
    <Select
      value={lead.status}
      options={STATUS_OPTIONS}
      disabled={disabled}
      size="small"
      style={{ minWidth: 140 }}
      onClick={(event) => event.stopPropagation()}
      onChange={(newStatus) => onRequestChange(lead, newStatus)}
    />
  );
}

export default LeadStatusSelect;
