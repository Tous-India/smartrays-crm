/**
 * The React Native preset, plus what this JavaScript project needs on top:
 * the preset transforms js/ts/tsx only, so .jsx is added; our own setup file
 * (native-module mocks) runs after the preset's; and the navigation packages
 * ship untranspiled ESM, so they are transformed like react-native itself.
 * Keys listed here REPLACE the preset's, which is why the preset's own
 * entries are repeated rather than assumed.
 */
module.exports = {
  preset: "@react-native/jest-preset",
  // This is an Android app: Platform.OS must say so under Jest, or every
  // Android-only branch (API-level permission checks) is skipped.
  haste: { defaultPlatform: "android", platforms: ["android", "native"] },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
    "^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$": require.resolve(
      "@react-native/jest-preset/jest/assetFileTransformer.js"
    ),
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-screens|react-native-safe-area-context)/)",
  ],
  setupFiles: [require.resolve("@react-native/jest-preset/jest/setup.js"), "<rootDir>/jest.setup.js"],
};
