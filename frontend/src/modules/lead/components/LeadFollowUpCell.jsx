import { DatePicker } from "antd";
import dayjs from "dayjs";

function isOverdue(followUpDate) {
  return followUpDate && new Date(followUpDate) < new Date();
}

/**
 * Inline-editable Follow-up cell for the Leads table — the same "click the
 * value, pick a new one, saves immediately" convention the Owner and Status
 * columns already use (an AntD control rendered directly in the cell,
 * opening its own popup on click, no separate Save button and no full
 * modal), just for `followUpDate` instead of `ownerId`/`status`. `onChange`
 * fires `onReschedule` directly — AntD's `showTime` DatePicker still needs
 * its own internal "OK" to confirm a time selection before closing, but
 * that's the picker's own built-in behavior, not an extra step this
 * component adds.
 */
function LeadFollowUpCell({ lead, onReschedule }) {
  const value = lead.followUpDate ? dayjs(lead.followUpDate) : null;

  function handleChange(newValue) {
    onReschedule(lead, newValue ? newValue.toISOString() : null);
  }

  return (
    <DatePicker
      value={value}
      onChange={handleChange}
      showTime={{ format: "HH:mm" }}
      format="YYYY-MM-DD HH:mm"
      size="small"
      allowClear
      placeholder="Set follow-up"
      variant="borderless"
      // Explicit width — "YYYY-MM-DD HH:mm" (16 chars) plus the calendar
      // icon needs more room than AntD's own default DatePicker width
      // gives it; left unset, the input truncated its own text (down to
      // "S.." for the placeholder) rather than the column being too
      // narrow for a naturally-sized picker.
      style={{ width: 150 }}
      className={isOverdue(lead.followUpDate) ? "!text-red-600 font-medium" : ""}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

export default LeadFollowUpCell;
