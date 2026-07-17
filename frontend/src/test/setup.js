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
