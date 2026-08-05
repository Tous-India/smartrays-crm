import dayjs from "dayjs";

/**
 * Local-date helpers (2026-08-05). Created because no shared one existed —
 * `dayjs(x).format("YYYY-MM-DD")` was being written out inline in half a
 * dozen components, which is exactly the kind of duplication that lets one
 * copy quietly drift into `toISOString()`.
 *
 * **Never use `toISOString()` on a local-midnight value.** `new Date(2026, 7,
 * 5).toISOString()` is `2026-08-04T18:30:00Z` at UTC+5:30 — the day BEFORE
 * the one the user picked. A previous batch shipped that bug into synthetic
 * attendance rows, which rendered and submitted every date one day early.
 * `toLocalDateKey` formats from the local calendar fields instead, so what
 * the user sees and what the API receives are the same day.
 */
export function toLocalDateKey(value) {
  if (!value) {
    return null;
  }

  return dayjs(value).format("YYYY-MM-DD");
}

export function toLocalMonthKey(value) {
  if (!value) {
    return null;
  }

  return dayjs(value).format("YYYY-MM");
}

/**
 * The attendance date filter's presets (§B8, 2026-08-05) — replaces the old
 * separate month picker + start/end range pickers with one dropdown.
 * "Custom" is the only option that reveals date inputs.
 */
export const DATE_RANGE_PRESETS = {
  today: "today",
  yesterday: "yesterday",
  thisMonth: "this_month",
  custom: "custom",
};

export const DATE_RANGE_OPTIONS = [
  { value: DATE_RANGE_PRESETS.today, label: "Today" },
  { value: DATE_RANGE_PRESETS.yesterday, label: "Yesterday" },
  { value: DATE_RANGE_PRESETS.thisMonth, label: "This Month" },
  { value: DATE_RANGE_PRESETS.custom, label: "Custom" },
];

/**
 * Resolves a preset (plus the custom range, when that preset is selected)
 * to an inclusive `{ from, to }` pair of dayjs values in LOCAL time.
 * Returns `null` for a custom preset with no range chosen yet, so callers
 * can skip fetching rather than guessing a default.
 */
export function resolveDateRange(preset, customRange) {
  const today = dayjs();

  switch (preset) {
    case DATE_RANGE_PRESETS.today:
      return { from: today.startOf("day"), to: today.endOf("day") };

    case DATE_RANGE_PRESETS.yesterday: {
      const yesterday = today.subtract(1, "day");
      return { from: yesterday.startOf("day"), to: yesterday.endOf("day") };
    }

    case DATE_RANGE_PRESETS.thisMonth:
      return { from: today.startOf("month"), to: today.endOf("month") };

    case DATE_RANGE_PRESETS.custom:
      if (!customRange?.[0] || !customRange?.[1]) {
        return null;
      }
      return { from: customRange[0].startOf("day"), to: customRange[1].endOf("day") };

    default:
      return { from: today.startOf("day"), to: today.endOf("day") };
  }
}

/**
 * Every distinct `YYYY-MM` the range touches.
 *
 * The attendance LIST endpoints (`GET /attendance/me`, `GET /attendance/team`)
 * accept only `?month=` — verified against `attendance.validation.js`'s
 * `validateMonthQuery`, which rejects anything else; only
 * `GET /attendance/report` takes a real `from`/`to`. So an arbitrary range is
 * served by fetching each month it spans and narrowing client-side, the same
 * approach `AdminAttendanceView` already used for its own custom range. In
 * practice that's one request — Today, Yesterday and This Month never span
 * two months, and only a month-straddling custom range costs a second.
 */
export function monthKeysInRange(from, to) {
  const keys = [];
  let cursor = from.startOf("month");
  const last = to.startOf("month");

  while (cursor.isBefore(last) || cursor.isSame(last, "month")) {
    keys.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return keys;
}

/** Inclusive local-day containment check for narrowing fetched records. */
export function isWithinRange(date, from, to) {
  const ms = dayjs(date).valueOf();

  return ms >= from.valueOf() && ms <= to.valueOf();
}
