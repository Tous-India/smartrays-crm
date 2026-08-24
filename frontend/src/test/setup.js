import "@testing-library/jest-dom";

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
 * jsdom implements no `ResizeObserver`, and `LeafletMapView` uses one to keep
 * Leaflet's cached container size in step with the real element (§7.66).
 * A no-op stub is enough: the observer's job is a side effect on a real map
 * instance, which is mocked in every test that renders a map anyway.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
