import dayjs from "dayjs";
import { Tag, Tooltip } from "antd";
import {
  CheckCircleOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  GEOFENCE_STATE,
  formatDistance,
  geofenceChipLabel,
  summarizeGeofence,
} from "../utils/geofenceSummary";

/**
 * The Geofence column: how far the employee strayed from their check-in
 * point, as a STATUS CHIP (§7.4g, 2026-08-06).
 *
 * It used to be a bar, and that was the problem. Two bars of identical width
 * sat side by side in one row measuring unrelated things — the timeline
 * covers "was the device connected" across the whole day, this covers "how
 * far from the check-in point" across the shift. Even after both were put on
 * a shared axis (§7.4f), the shapes still invited reading one against the
 * other. A chip reads as a value, like every other column in this table, and
 * cannot be visually diffed against a bar.
 *
 * Four states, and `no_data` is the one that earns the rewrite: the old bar
 * painted a shift with no position data exactly like one fully inside the
 * geofence. "We never heard where they were" and "they were where they
 * should be" are opposite findings and no longer share a colour — this one is
 * gray AND dashed, because a solid gray chip beside a green one still scans
 * as a pass.
 *
 * The tooltip is the same controlled AntD `Tooltip` the timeline uses — never
 * a native `title`, which a browser can render at the same moment as an AntD
 * tooltip from the neighbouring column.
 */

const CHIP = {
  [GEOFENCE_STATE.NO_DATA]: {
    color: "default",
    icon: <QuestionCircleOutlined />,
    className: "!border-dashed !text-gray-500",
  },
  [GEOFENCE_STATE.IN_PROGRESS]: { color: "processing", icon: <SyncOutlined />, className: "" },
  [GEOFENCE_STATE.WITHIN_RANGE]: { color: "success", icon: <CheckCircleOutlined />, className: "" },
  [GEOFENCE_STATE.VIOLATIONS]: { color: "warning", icon: <WarningOutlined />, className: "" },
};

function formatClock(value) {
  return dayjs(value).format("h:mm A");
}

function tooltipContent(summary) {
  if (summary.state === GEOFENCE_STATE.NO_DATA) {
    return "No location data for this shift — the geofence was never evaluated, so this is not a pass.";
  }

  if (summary.state === GEOFENCE_STATE.IN_PROGRESS) {
    return "Shift still open — no excursions recorded yet.";
  }

  if (summary.state === GEOFENCE_STATE.WITHIN_RANGE) {
    return "Stayed within the geofence radius of the check-in point for the whole shift.";
  }

  return (
    <div>
      <div className="mb-1 font-medium">Outside the geofence</div>
      {summary.violations.map((violation, index) => (
        <div key={index}>
          {formatClock(violation.start)} – {violation.end ? formatClock(violation.end) : "checkout"}
          {violation.maxDistanceMeters != null &&
            ` · up to ${formatDistance(violation.maxDistanceMeters)}`}
        </div>
      ))}
    </div>
  );
}

function GeofenceViolationBar({ record, onInvestigate }) {
  const summary = summarizeGeofence(record);
  const chip = CHIP[summary.state];

  // Only an excursion is worth opening a map for, and only where the caller
  // supplied somewhere to go. `AttendancePhotoModal` deliberately passes
  // nothing — it already has its own "View on Map" button, and a modal
  // opening another modal from inside itself is worse than one extra click.
  const isInteractive = summary.state === GEOFENCE_STATE.VIOLATIONS && Boolean(onInvestigate);

  const interactiveProps = isInteractive
    ? {
        role: "button",
        tabIndex: 0,
        // The table row has its own onClick (it opens the photo modal);
        // without stopping propagation the chip would trigger both.
        onClick: (event) => {
          event.stopPropagation();
          onInvestigate(record);
        },
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
            event.preventDefault();
            onInvestigate(record);
          }
        },
      }
    : {};

  return (
    <Tooltip title={tooltipContent(summary)}>
      <span data-testid="geofence-chip-wrapper">
        <Tag
          color={chip.color}
          icon={chip.icon}
          className={`!mr-0 whitespace-nowrap ${chip.className} ${isInteractive ? "cursor-pointer" : ""}`}
          data-testid="geofence-chip"
          data-state={summary.state}
          {...interactiveProps}
        >
          {geofenceChipLabel(summary)}
        </Tag>
      </span>
    </Tooltip>
  );
}

export default GeofenceViolationBar;
