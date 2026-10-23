import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LiveStaffWidget from "./LiveStaffWidget";
import useSessionStore from "../../../store/sessionStore";
import * as locationApi from "../../location/api/locationApi";

vi.mock("../../location/api/locationApi", () => ({ fetchLiveStatus: vi.fn() }));

/**
 * Live staff on the dashboard (2026-10-23): on shift, need attention, not
 * checked in — from GET /location/live-status — and the live map in one tap.
 */
function renderWidget() {
  return render(
    <MemoryRouter>
      <LiveStaffWidget />
    </MemoryRouter>
  );
}

describe("LiveStaffWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: { _id: "admin-1", role: "admin", permissions: {} }, isAuthenticated: true, isLoading: false });
  });

  it("counts the server's statuses and links straight to the Live Map tab", async () => {
    locationApi.fetchLiveStatus.mockResolvedValue({
      data: { data: { people: [{ status: "moving" }, { status: "location_off" }, { status: "disconnected" }, { status: "not_checked_in" }, { status: "checked_out" }] } },
    });
    renderWidget();

    expect(await screen.findByTestId("live-staff-on_shift")).toHaveTextContent("3");
    expect(screen.getByTestId("live-staff-attention")).toHaveTextContent("2");
    expect(screen.getByTestId("live-staff-not_checked_in")).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: "Open live map" })).toHaveAttribute("href", "/attendance?tab=live-map");
  });

  it("renders nothing for someone without a team-location grant", () => {
    useSessionStore.setState({ user: { _id: "e1", role: "employee", permissions: { location: { view: true } } }, isAuthenticated: true, isLoading: false });
    const { container } = renderWidget();

    expect(container).toBeEmptyDOMElement();
    expect(locationApi.fetchLiveStatus).not.toHaveBeenCalled();
  });
});
