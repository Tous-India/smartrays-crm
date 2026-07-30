import { useState } from "react";
import { DatePicker, Tooltip, Button } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
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
 *
 * `iconOnly` (default `false`, preserving the table's own visible-field
 * behavior unchanged) — same two-display-modes-one-component shape already
 * established for `CustomerStatusToggleButton`'s own `iconOnly` prop. The
 * underlying `DatePicker` stays mounted either way (same value/onChange/
 * format, so it's still the exact same reschedule logic and popup); in
 * icon mode it's shrunk to a 1x1px, invisible, non-interactive trigger
 * rather than removed, since AntD's popup positions itself relative to
 * this element still being present in the layout (`display: none` would
 * break that). A separate, real calendar icon button (wrapped in the same
 * Tooltip pattern the quick-action row already uses) sits on top and just
 * flips the DatePicker's own controlled `open` state — no second copy of
 * the date-picking logic.
 */
function LeadFollowUpCell({ lead, onReschedule, iconOnly = false }) {
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const value = lead.followUpDate ? dayjs(lead.followUpDate) : null;

  function handleChange(newValue) {
    onReschedule(lead, newValue ? newValue.toISOString() : null);
  }

  const picker = (
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
      // narrow for a naturally-sized picker. In icon mode this is instead
      // collapsed to an invisible 1x1px trigger — see the component docblock.
      style={iconOnly ? { position: "absolute", width: 1, height: 1, padding: 0, opacity: 0 } : { width: 150 }}
      className={isOverdue(lead.followUpDate) ? "!text-red-600 font-medium" : ""}
      onClick={(event) => event.stopPropagation()}
      {...(iconOnly ? { open: isIconPickerOpen, onOpenChange: setIsIconPickerOpen } : {})}
    />
  );

  if (!iconOnly) {
    return picker;
  }

  return (
    <span className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
      <Tooltip title="Reschedule">
        <Button
          type="text"
          size="small"
          icon={<CalendarOutlined />}
          aria-label="Reschedule"
          onClick={() => setIsIconPickerOpen(true)}
        />
      </Tooltip>
      {picker}
    </span>
  );
}

export default LeadFollowUpCell;
