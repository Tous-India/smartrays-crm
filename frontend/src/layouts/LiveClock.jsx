import { useEffect, useState } from "react";

/**
 * Real-time clock/date shown in the shortened top bar (§ UI/UX pass). Ticks
 * every second via `setInterval` — a plain `useState`/`useEffect` pair, per
 * smartrays.md's "prefer React state, no extra data-fetching library" rule,
 * the same reasoning every other interval-driven piece in this app already
 * follows (`useCheckedInHeartbeatLoop`, the Location live-map poll).
 *
 * Format: "Mon, 21 Jul 2026 · 3:45 PM" — `en-GB` naturally orders
 * day/month/year in that sequence for the date half; the time half is
 * formatted separately since a single locale/option set can't produce both
 * halves in this exact combined shape.
 */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const datePart = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <span className="text-sm text-white/80">
      {datePart} · {timePart}
    </span>
  );
}

export default LiveClock;
