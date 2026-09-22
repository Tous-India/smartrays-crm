/**
 * Native modules the app depends on, replaced for Jest. Each mock is the
 * smallest thing that lets the JS above it run: the keychain is an in-memory
 * map keyed by service, the config is the env the tests expect.
 */
const mockKeychainEntries = new Map();

jest.mock("react-native-keychain", () => ({
  setGenericPassword: jest.fn(async (username, password, options = {}) => {
    mockKeychainEntries.set(options.service || "default", { username, password });
    return true;
  }),
  getGenericPassword: jest.fn(async (options = {}) => mockKeychainEntries.get(options.service || "default") || false),
  resetGenericPassword: jest.fn(async (options = {}) => {
    mockKeychainEntries.delete(options.service || "default");
    return true;
  }),
  __entries: mockKeychainEntries,
}));

jest.mock("react-native-config", () => ({ API_BASE_URL: "http://test.local/api/v1", WEB_APP_URL: "https://web.test" }));

// The native safe-area provider renders nothing until the platform reports
// insets; the package's own Jest mock supplies them.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

// Connectivity: online unless a test says otherwise (see useIsOnline).
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn((listener) => {
    listener({ isConnected: true, isInternetReachable: true });
    return () => {};
  }),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

// Geolocation: a fix is whatever the test enqueues via mockGeolocationNext.
const mockGeolocation = { next: null };
global.mockGeolocationNext = (outcome) => {
  mockGeolocation.next = outcome;
};
jest.mock("@react-native-community/geolocation", () => ({
  getCurrentPosition: jest.fn((success, failure) => {
    const outcome = mockGeolocation.next || { coords: { latitude: 28.61, longitude: 77.2, accuracy: 12 } };
    if (outcome.error) {
      failure(outcome.error);
    } else {
      success(outcome);
    }
  }),
  setRNConfiguration: jest.fn(),
}));

// The camera is a native view; under Jest it is a plain view with a
// takePhoto that yields a fake file.
jest.mock("react-native-vision-camera", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Camera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePhoto: jest.fn(async () => ({ path: "/tmp/photo.jpg", width: 4000, height: 3000 })),
    }));
    return React.createElement(View, { testID: props.testID });
  });
  return { Camera, useCameraDevice: jest.fn(() => ({ id: "front", position: "front" })) };
});

// The date dialog: a stand-in view carrying the real props, so a test picks a
// day by calling the rendered element's `onChange({ type: "set" }, date)`.
jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockDateTimePicker = (props) => React.createElement(View, { testID: "mock-date-picker", ...props });
  return { __esModule: true, default: MockDateTimePicker };
});

// The payslip download and the "open with" intent: nothing to fetch in Jest.
const mockBlobUtil = {
  fetches: [],
  config: jest.fn(() => ({
    fetch: jest.fn(async (method, url, headers) => {
      mockBlobUtil.fetches.push({ method, url, headers });
      return { info: () => ({ status: 200 }), path: () => "/cache/payslip.pdf", text: async () => "" };
    }),
  })),
  fs: { dirs: { CacheDir: "/cache" } },
  android: { actionViewIntent: jest.fn(async () => {}) },
};
global.mockBlobUtil = mockBlobUtil;
jest.mock("react-native-blob-util", () => ({ __esModule: true, default: mockBlobUtil }));

jest.mock("@bam.tech/react-native-image-resizer", () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(async () => ({ uri: "file:///tmp/photo-small.jpg", size: 188416, width: 1280, height: 960 })),
  },
}));

// The tracking engine's native module (TrackingModule.kt), as an in-memory
// twin: a queue array and a flags map, plus the service's start/stop state.
const mockTracking = { running: false, intervalMs: null, queue: [], flags: {}, lastCapturedAt: null };
global.mockTrackingNative = mockTracking;
jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  // The Android platform constants the preset leaves empty: API level (the
  // permission branches key on it) and the brand/model the device label uses.
  Object.defineProperty(actual.Platform, "constants", {
    configurable: true,
    value: { ...actual.Platform.constants, Version: 34, Release: "14", Brand: "google", Manufacturer: "Google", Model: "sdk_gphone" },
  });
  Object.defineProperty(actual.Platform, "Version", { configurable: true, get: () => 34 });
  actual.NativeModules.SmartraysTracking = {
    start: jest.fn(async (intervalMs) => {
      mockTracking.running = true;
      mockTracking.intervalMs = intervalMs;
    }),
    stop: jest.fn(async () => {
      mockTracking.running = false;
    }),
    getStatus: jest.fn(async () => ({
      isRunning: mockTracking.running,
      queuedCount: mockTracking.queue.length,
      lastCapturedAt: mockTracking.lastCapturedAt,
      intervalMs: mockTracking.intervalMs,
    })),
    takeQueued: jest.fn(async (limit) =>
      JSON.stringify([...mockTracking.queue].sort((a, b) => a.capturedAt - b.capturedAt).slice(0, limit))
    ),
    deleteQueued: jest.fn(async (ids) => {
      const before = mockTracking.queue.length;
      mockTracking.queue = mockTracking.queue.filter((row) => !ids.includes(row.id));
      return before - mockTracking.queue.length;
    }),
    pruneCapturedBefore: jest.fn(async (cutoff) => {
      const before = mockTracking.queue.length;
      mockTracking.queue = mockTracking.queue.filter((row) => row.capturedAt >= cutoff);
      return before - mockTracking.queue.length;
    }),
    setFlag: jest.fn(async (key, value) => {
      if (value === null) delete mockTracking.flags[key];
      else mockTracking.flags[key] = value;
    }),
    getFlag: jest.fn(async (key) => mockTracking.flags[key] ?? null),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
  return actual;
});
