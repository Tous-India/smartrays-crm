import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import LiveStatusPanel from "./LiveStatusPanel";
import * as locationApi from "../api/locationApi";

vi.mock("../api/locationApi", () => ({ fetchLocationTimeline: vi.fn() }));

/**
 * Live employee status on the web (2026-10-23): counts at the top (tappable to
 * filter), the team list with problems first, the same names and colours as
 * the app (from GET /location/config), and one person's day on a click.
 */
const STATUSES = [
  { key: "moving", label: "Moving", color: "#1971c2" },
  { key: "stationary", label: "Stationary", color: "#f08c00" },
  { key: "at_site", label: "At site", color: "#2f9e44" },
  { key: "offline", label: "Offline", color: "#868e96" },
  { key: "location_off", label: "Location off", color: "#e03131" },
  { key: "disconnected", label: "Disconnected", color: "#343a40" },
  { key: "checked_out", label: "Checked out", color: "#495057" },
  { key: "not_checked_in", label: "Not checked in", color: "#adb5bd" },
  { key: "on_leave", label: "On leave", color: "#7048e8" },
];
const NOW = Date.now();
const ago = (m) => new Date(NOW - m * 60000).toISOString();

const LIVE = {
  people: [
    { employeeId: "e2", name: "Ritu Chauhan", status: "disconnected", since: ago(45), lastSyncAt: ago(45), battery: 40, batteryLow: false },
    { employeeId: "e5", name: "Imran Qureshi", status: "location_off", since: ago(12), lastSyncAt: ago(10), battery: 60, batteryLow: false },
    { employeeId: "e1", name: "Deepak Yadav", status: "moving", since: ago(2), speedKmh: 32, lastPingAt: ago(1), lastSyncAt: ago(1), battery: 12, batteryLow: true },
    { employeeId: "e3", name: "Karan Gill", status: "stationary", since: ago(25), place: "Sharma Residence", lastPingAt: ago(2), lastSyncAt: ago(2), battery: 80, batteryLow: false },
    { employeeId: "e4", name: "Manoj Bisht", status: "on_leave", since: null },
  ],
  counts: { moving: 1, stationary: 1, at_site: 0, offline: 0, location_off: 1, disconnected: 1, battery_low: 1 },
};

function renderPanel(props = {}) {
  return render(
    <App>
      <LiveStatusPanel live={LIVE} statuses={STATUSES} {...props} />
    </App>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("LiveStatusPanel", () => {
  it("shows the counts with the status colours, and the list problems-first", () => {
    renderPanel();
    const moving = screen.getByRole("button", { name: /Moving 1/ });
    expect(moving).toHaveAttribute("data-color", "#1971c2");
    expect(screen.getByRole("button", { name: /Disconnected 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Location off 1/ })).toBeInTheDocument();

    const rows = screen.getAllByTestId(/^live-row-/).map((row) => row.dataset.testid.replace("live-row-", ""));
    expect(rows).toEqual(["e2", "e5", "e1", "e3", "e4"]);
  });

  it("each row says what is happening in plain words: since when, speed, place, battery", () => {
    renderPanel();
    const deepak = screen.getByTestId("live-row-e1");
    expect(within(deepak).getByText("Moving")).toBeInTheDocument();
    expect(within(deepak).getByText(/32 km\/h/)).toBeInTheDocument();
    expect(within(deepak).getByText(/Battery low · 12 %/)).toBeInTheDocument();
    const karan = screen.getByTestId("live-row-e3");
    expect(within(karan).getByText(/at the same place for 25 min/)).toBeInTheDocument();
    expect(within(karan).getByText(/Sharma Residence/)).toBeInTheDocument();
    expect(within(screen.getByTestId("live-row-e2")).getByText(/last synced 45 min ago/)).toBeInTheDocument();
  });

  it("tapping a count filters the list; tapping it again shows everyone", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Location off 1/ }));
    expect(screen.getAllByTestId(/^live-row-/)).toHaveLength(1);
    expect(screen.getByTestId("live-row-e5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Location off 1/ }));
    expect(screen.getAllByTestId(/^live-row-/)).toHaveLength(5);
  });

  it("a click on a person shows their day as a timeline", async () => {
    locationApi.fetchLocationTimeline.mockResolvedValue({
      data: {
        data: {
          entries: [
            { at: "2026-10-23T04:10:00.000Z", status: "checked_in", label: "Checked in" },
            { at: "2026-10-23T04:35:00.000Z", status: "moving", label: "Moving" },
            { at: "2026-10-23T05:20:00.000Z", status: "at_site", label: "At Sharma Residence" },
            { at: "2026-10-23T06:40:00.000Z", status: "location_off", label: "Location off" },
          ],
        },
      },
    });
    const onSelect = vi.fn();
    renderPanel({ onSelect });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("live-row-e1"));
    expect(onSelect).toHaveBeenCalledWith("e1");
    expect(locationApi.fetchLocationTimeline).toHaveBeenCalledWith("e1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(await screen.findByText("At Sharma Residence")).toBeInTheDocument();
    expect(screen.getByText("9:40 AM")).toBeInTheDocument();
  });
});
