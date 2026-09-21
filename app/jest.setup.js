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

jest.mock("@bam.tech/react-native-image-resizer", () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(async () => ({ uri: "file:///tmp/photo-small.jpg", size: 188416, width: 1280, height: 960 })),
  },
}));
