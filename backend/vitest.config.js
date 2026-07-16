import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Starting a MongoMemoryServer per test file can take a few seconds.
    hookTimeout: 30000,
    testTimeout: 15000,
    // Run test files serially, not in parallel worker threads — each file
    // starts its own in-memory MongoDB instance, and running many at once
    // is unnecessary for a suite this size and easier to reason about.
    fileParallelism: false,
  },
});
