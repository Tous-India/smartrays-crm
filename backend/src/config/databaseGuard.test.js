import { describe, expect, it } from "vitest";
import { assertDatabaseTargetAllowed, isLocalMongoUri } from "./databaseGuard.js";

// The local backend used to point at the production Atlas cluster, so every
// verification wrote real records. Outside production, a non-local database
// now needs ALLOW_REMOTE_DB=true written down on purpose.
describe("isLocalMongoUri", () => {
  it.each([
    "mongodb://localhost:27017/smartrays_dev",
    "mongodb://127.0.0.1:27017/smartrays_dev",
    "mongodb://127.0.0.1/smartrays_dev?directConnection=true",
    "mongodb://[::1]:27017/smartrays_dev",
    "mongodb://user:p%40ss@localhost:27017/smartrays_dev?authSource=admin",
    "mongodb://localhost:27017,127.0.0.1:27018/smartrays_dev?replicaSet=rs0",
  ])("treats %s as local", (uri) => {
    expect(isLocalMongoUri(uri)).toBe(true);
  });

  it.each([
    "mongodb+srv://user:pass@cluster0.abcde.mongodb.net/smartrays",
    "mongodb://user:pass@cluster0-shard-00-00.abcde.mongodb.net:27017/smartrays",
    "mongodb://localhost:27017,db.example.com:27017/smartrays?replicaSet=rs0",
    // A password containing "@localhost" must not fool the host parse.
    "mongodb://user:x@localhost@db.example.com/smartrays",
    "mongodb://localhost.example.com/smartrays",
    "",
    undefined,
    "not a uri",
  ])("treats %s as NOT local", (uri) => {
    expect(isLocalMongoUri(uri)).toBe(false);
  });
});

describe("assertDatabaseTargetAllowed", () => {
  const remote = "mongodb+srv://user:pass@cluster0.abcde.mongodb.net/smartrays";
  const local = "mongodb://127.0.0.1:27017/smartrays_dev";

  it("lets development connect to a local database", () => {
    expect(() => assertDatabaseTargetAllowed({ nodeEnv: "development", mongodbUri: local })).not.toThrow();
  });

  it("refuses a remote database in development", () => {
    expect(() => assertDatabaseTargetAllowed({ nodeEnv: "development", mongodbUri: remote })).toThrow(
      /ALLOW_REMOTE_DB=true/
    );
  });

  it("refuses a remote database in any non-production environment (test, unset)", () => {
    expect(() => assertDatabaseTargetAllowed({ nodeEnv: "test", mongodbUri: remote })).toThrow();
    expect(() => assertDatabaseTargetAllowed({ nodeEnv: undefined, mongodbUri: remote })).toThrow();
  });

  it("allows a remote database outside production only when ALLOW_REMOTE_DB is exactly 'true'", () => {
    expect(() =>
      assertDatabaseTargetAllowed({ nodeEnv: "development", mongodbUri: remote, allowRemoteDb: "true" })
    ).not.toThrow();
    expect(() =>
      assertDatabaseTargetAllowed({ nodeEnv: "development", mongodbUri: remote, allowRemoteDb: "1" })
    ).toThrow();
    expect(() =>
      assertDatabaseTargetAllowed({ nodeEnv: "development", mongodbUri: remote, allowRemoteDb: "yes" })
    ).toThrow();
  });

  it("does not apply in production (Vercel), where the database is remote by design", () => {
    expect(() => assertDatabaseTargetAllowed({ nodeEnv: "production", mongodbUri: remote })).not.toThrow();
  });

  it("never puts the connection string (or its password) in the error", () => {
    let message = "";
    try {
      assertDatabaseTargetAllowed({ nodeEnv: "development", mongodbUri: remote });
    } catch (error) {
      message = error.message;
    }
    expect(message).not.toContain("pass");
    expect(message).not.toContain("cluster0");
    expect(message).not.toContain("mongodb+srv");
  });
});
