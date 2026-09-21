module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // The preset already treats *.test.js as Jest; this project's tests are
      // .jsx and the mock setup lives outside any test file.
      files: ['**/*.test.{js,jsx}', '**/__tests__/**', 'jest.setup.js'],
      env: { jest: true },
    },
  ],
};
