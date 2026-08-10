import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import HistoryMapView from "./HistoryMapView";
import useSessionStore from "../../../store/sessionStore";

const markerCalls = [];
const polylineCalls = [];

/**
 * `react-leaflet`'s real `MapContainer` needs an actual browser Map
 * instance (DOM measurement, tile loading) that jsdom doesn't support —
 * mocked at the module boundary here instead, the same "stub the map
 * library" approach previously used for `window.google.maps`. `Marker`/
 * `Polyline` are captured into plain arrays so tests can assert against the
 * exact props `LeafletMapView` passed them.
 */
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="rl-map">{children}</div>,
  TileLayer: () => null,
  Marker: (props) => {
    markerCalls.push(props);
    return <div data-testid="rl-marker" />;
  },
  Polyline: (props) => {
    polylineCalls.push(props);
    return <div data-testid="rl-polyline" />;
  },
  Popup: ({ children }) => children,
  useMap: () => ({ fitBounds: vi.fn() }),
}));

vi.mock("../hooks/useLocationHistory", () => ({
  default: vi.fn(),
}));
vi.mock("../../../hooks/useUserDirectory", () => ({
  default: () => ({ users: [{ _id: "emp-1", name: "Employee One" }] }),
}));

const useLocationHistory = (await import("../hooks/useLocationHistory")).default;

beforeEach(() => {
  markerCalls.length = 0;
  polylineCalls.length = 0;
  useSessionStore.setState({
    user: { _id: "emp-1", role: "employee", permissions: { location: { view: true } } },
    isAuthenticated: true,
    isLoading: false,
  });
});

describe("HistoryMapView", () => {
  it("fetches and renders the selected employee/date's ping trail as a polyline", () => {
    useLocationHistory.mockReturnValue({
      pings: [
        { coords: { lat: 12.9, lng: 77.6 }, capturedAt: "2026-06-01T09:00:00.000Z" },
        { coords: { lat: 12.91, lng: 77.61 }, capturedAt: "2026-06-01T09:05:00.000Z" },
      ],
      isLoading: false,
      error: null,
    });

    render(<HistoryMapView />);

    expect(screen.getByTestId("leaflet-map-container")).toBeInTheDocument();
    expect(polylineCalls).toHaveLength(1);
    expect(polylineCalls[0].positions).toEqual([
      [12.9, 77.6],
      [12.91, 77.61],
    ]);
  });

  it("shows an empty state instead of a blank map when there are no pings for that day", () => {
    useLocationHistory.mockReturnValue({ pings: [], isLoading: false, error: null });

    render(<HistoryMapView />);

    expect(polylineCalls).toHaveLength(0);
    expect(screen.getByText(/No location pings recorded/)).toBeInTheDocument();
  });

  it("shows a clear error instead of a blank map for an out-of-scope employee (404)", () => {
    useLocationHistory.mockReturnValue({
      pings: [],
      isLoading: false,
      error: { response: { status: 404 } },
    });

    render(<HistoryMapView />);

    expect(screen.getByText(/Could not load this employee's location history/)).toBeInTheDocument();
    expect(screen.getByText(/isn't visible to you/)).toBeInTheDocument();
  });
});

describe("HistoryMapView — reused for the Attendance map integration (§7.4d, 2026-08-04)", () => {
  it("locks to the given initialEmployeeId/initialDate and hides the pickers when showControls is false", () => {
    useLocationHistory.mockReturnValue({
      pings: [{ coords: { lat: 12.9, lng: 77.6 }, capturedAt: "2026-06-01T09:00:00.000Z" }],
      isLoading: false,
      error: null,
    });

    render(<HistoryMapView initialEmployeeId="emp-9" initialDate="2026-06-01" showControls={false} />);

    expect(useLocationHistory).toHaveBeenCalledWith({ employeeId: "emp-9", date: "2026-06-01" });
    expect(screen.queryByPlaceholderText("Select an employee")).not.toBeInTheDocument();
    expect(screen.getByTestId("leaflet-map-container")).toBeInTheDocument();
  });

  it("passes deriveExtraMarkers(pings) through to the map as markers", () => {
    const pings = [{ coords: { lat: 12.9, lng: 77.6 }, capturedAt: "2026-06-01T09:00:00.000Z" }];
    useLocationHistory.mockReturnValue({ pings, isLoading: false, error: null });
    const deriveExtraMarkers = vi.fn(() => [{ lat: 1, lng: 1, label: "Test marker", color: "red" }]);

    render(<HistoryMapView deriveExtraMarkers={deriveExtraMarkers} />);

    expect(deriveExtraMarkers).toHaveBeenCalledWith(pings);
    expect(markerCalls).toHaveLength(1);
    expect(markerCalls[0]).toMatchObject({ position: [1, 1], title: "Test marker" });
    // "red" maps to a real, distinguishing fill color in the pin's SVG icon.
    expect(markerCalls[0].icon.options.html).toContain("#e03131");
  });
});
