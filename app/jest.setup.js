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
