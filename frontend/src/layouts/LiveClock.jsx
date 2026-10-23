import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { DISPLAY_DATE_FORMAT, formatTime } from "../utils/date.utils";

/**
 * Real-time clock/date shown in the shortened top bar (§ UI/UX pass). Ticks
 * every second via `setInterval` — a plain `useState`/`useEffect` pair, per
 * smartrays.md's "prefer React state, no extra data-fetching library" rule,
 * the same reasoning every other interval-driven piece in this app already
 * follows (`useCheckedInHeartbeatLoop`, the Location live-map poll).
 *
 * Format: "Mon, 21 Jul 2026 · 3:45 PM" — from the shared display formats.
 */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  // The shared display formats (utils/date.utils.js, 2026-10-23): the weekday
  // plus DD MMM YYYY, and h:mm AM/PM — same output as before, no locale needed.
  const datePart = dayjs(now).format(`ddd, ${DISPLAY_DATE_FORMAT}`);
  const timePart = formatTime(now);

  return (
    <span className="text-sm text-white/80">
      {datePart} · {timePart}
    </span>
  );
}

export default LiveClock;
