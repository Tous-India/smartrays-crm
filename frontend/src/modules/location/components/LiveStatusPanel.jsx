import { useEffect, useMemo, useState } from "react";
import { Drawer, Empty, Spin, Timeline } from "antd";
import { fetchLocationTimeline } from "../api/locationApi";
import { formatTime } from "../../../utils/date.utils";

/**
 * Live employee status (2026-10-23) — the counts at the top (tap to filter),
 * the team list with problems first (the server's order), and one person's
 * day as a timeline. Names and colours come from GET /location/config
 * (`statuses`), the same list the app uses.
 */
const COUNTED = ["moving", "stationary", "at_site", "offline", "location_off", "disconnected"];

function minutesSince(iso) {
  return iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null;
}

function duration(minutes) {
  if (minutes === null) return "";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** The one line under a name: what that status means right now. */
function detailLine(person) {
  const parts = [];
  if (person.status === "moving" && person.speedKmh) parts.push(`about ${person.speedKmh} km/h`);
  if (person.status === "stationary") parts.push(`at the same place for ${duration(minutesSince(person.since))}`);
  if (person.place) parts.push(person.place);
  if (["offline", "disconnected"].includes(person.status)) parts.push(`last synced ${duration(minutesSince(person.lastSyncAt))} ago`);
  if (person.status === "location_off") parts.push(`since ${formatTime(person.since)}`);
  if (person.status === "checked_out" && person.since) parts.push(`at ${formatTime(person.since)}`);
  return parts.join(" · ");
}

function StatusDot({ color }) {
  return <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function PersonDay({ person, meta, onClose }) {
  const [entries, setEntries] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    fetchLocationTimeline(person.employeeId, today)
      .then((response) => !cancelled && setEntries(response.data.data.entries))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [person.employeeId]);

  return (
    <Drawer open onClose={onClose} title={person.name} width={380}>
      <p className="flex items-center gap-2 text-base font-semibold">
        <StatusDot color={meta[person.status]?.color} />
        {meta[person.status]?.label ?? person.status}
        {person.since && <span className="font-normal text-gray-500">since {formatTime(person.since)}</span>}
      </p>
      <p className="mt-1 text-gray-600">{detailLine(person)}</p>
      {typeof person.battery === "number" && (
        <p className={person.batteryLow ? "mt-1 font-semibold text-amber-700" : "mt-1 text-gray-600"}>
          Battery {person.battery} %{person.charging ? " (charging)" : ""}
        </p>
      )}
      {person.lastPingAt && <p className="mt-1 text-gray-600">Last update {formatTime(person.lastPingAt)}</p>}

      <h3 className="mb-2 mt-5 font-semibold">Today</h3>
      {failed ? (
        <p className="text-red-700">Could not load the day.</p>
      ) : entries === null ? (
        <Spin />
      ) : entries.length === 0 ? (
        <Empty description="Nothing recorded today." />
      ) : (
        <Timeline
          items={entries.map((entry, index) => ({
            key: `${entry.at}-${index}`,
            color: meta[entry.status]?.color ?? "#163b78",
            children: (
              <div>
                <p className="font-medium">{entry.label}</p>
                <p className="text-sm text-gray-500">{formatTime(entry.at)}</p>
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  );
}

function LiveStatusPanel({ live, statuses, onSelect }) {
  const [filter, setFilter] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const meta = useMemo(() => Object.fromEntries((statuses || []).map((s) => [s.key, s])), [statuses]);
  const people = live?.people ?? [];
  const shown = filter ? people.filter((person) => person.status === filter) : people;
  const selected = people.find((person) => person.employeeId === selectedId) ?? null;

  function open(person) {
    setSelectedId(person.employeeId);
    onSelect?.(person.employeeId);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {COUNTED.map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              data-color={meta[key]?.color}
              aria-pressed={active}
              onClick={() => setFilter(active ? null : key)}
              className={`flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm ${active ? "border-brand-navy bg-[#e8eef8]" : "border-gray-200 bg-white"}`}
            >
              <StatusDot color={meta[key]?.color} />
              <span className="text-gray-800">
                {meta[key]?.label ?? key} {live?.counts?.[key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Empty description={filter ? "Nobody in this state right now." : "No one on the team yet."} />
      ) : (
        <ul className="divide-y rounded-xl border border-gray-200 bg-white">
          {shown.map((person) => (
            <li key={person.employeeId}>
              <button
                type="button"
                data-testid={`live-row-${person.employeeId}`}
                onClick={() => open(person)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <StatusDot color={meta[person.status]?.color} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{person.name}</span>
                    <span className="text-sm text-gray-700">{meta[person.status]?.label ?? person.status}</span>
                    {person.batteryLow && (
                      <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">Battery low · {person.battery} %</span>
                    )}
                  </span>
                  <span className="block text-sm text-gray-500">{detailLine(person)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <PersonDay person={selected} meta={meta} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

export default LiveStatusPanel;
