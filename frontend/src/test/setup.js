import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom has no real layout engine, so it doesn't implement matchMedia at
// all — Ant Design's responsive components (Grid breakpoints, etc.) call it
// unconditionally on mount. This stub is enough to satisfy that call in
// tests; it never needs to report a real match.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * Google Maps (2026-10-23): jsdom cannot run the Maps JavaScript API, so the
 * React wrapper is stubbed at the module boundary — plain elements carrying
 * the real props — and a test key is set so maps render (a test that needs
 * "Map not configured" clears it). A test that inspects marker/polyline
 * props mocks the module itself.
 */
vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-maps-key");
vi.mock("@vis.gl/react-google-maps", async () => {
  const React = await import("react");
  const el = (testid) => {
    const Component = ({ children }) => React.createElement("div", { "data-testid": testid }, children);
    return Component;
  };
  return {
    APIProvider: ({ children }) => children,
    Map: el("gmap"),
    Marker: React.forwardRef(function Marker() {
      return React.createElement("div", { "data-testid": "gmap-marker" });
    }),
    InfoWindow: el("gmap-info"),
    Polyline: el("gmap-polyline"),
    Circle: el("gmap-circle"),
    useMap: () => null,
    useMarkerRef: () => [() => {}, null],
  };
});

/**
 * jsdom implements no `ResizeObserver`; a no-op stub is enough for anything
 * that observes an element's size.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
