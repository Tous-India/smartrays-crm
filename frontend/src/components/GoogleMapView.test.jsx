import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import GoogleMapView from "./GoogleMapView";
import VisitMap from "../modules/visit/components/VisitMap";

/**
 * Google Maps (2026-10-23): with a key the map renders (the wrapper is the
 * global stub in src/test/setup.js); without one, "Map not configured" and no
 * map at all.
 */
afterEach(() => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-maps-key");
});

describe("GoogleMapView", () => {
  it("renders the map with one marker and one trail when a key is set", () => {
    render(<GoogleMapView markers={[{ lat: 28.6, lng: 77.2, label: "Deepak" }]} path={[{ lat: 28.6, lng: 77.2 }, { lat: 28.61, lng: 77.21 }]} />);

    expect(screen.getByTestId("google-map-container")).toBeInTheDocument();
    expect(screen.getAllByTestId("gmap-marker")).toHaveLength(1);
    expect(screen.getAllByTestId("gmap-polyline")).toHaveLength(1);
  });

  it("no key → 'Map not configured', and no map", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");
    render(<GoogleMapView markers={[{ lat: 28.6, lng: 77.2 }]} />);

    expect(screen.getByText("Map not configured")).toBeInTheDocument();
    expect(screen.queryByTestId("gmap")).not.toBeInTheDocument();
  });
});

describe("VisitMap", () => {
  it("no key → 'Map not configured' too", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");
    render(<VisitMap site={{ lat: 28.5, lng: 77.1 }} />);

    expect(screen.getByTestId("map-not-configured")).toBeInTheDocument();
  });

  it("with a key: the site circle and marker", () => {
    render(<VisitMap site={{ lat: 28.5, lng: 77.1 }} arrival={{ coords: { lat: 28.5, lng: 77.1 } }} />);

    expect(screen.getByTestId("gmap-circle")).toBeInTheDocument();
    expect(screen.getAllByTestId("gmap-marker")).toHaveLength(2);
  });
});
