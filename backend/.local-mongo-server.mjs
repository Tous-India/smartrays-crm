// Local-only helper: runs a real standalone MongoDB instance via
// mongodb-memory-server (already a devDependency, used by the test suite)
// since neither Docker nor a local mongod install is available on this
// machine. Not part of the app or its test suite — a throwaway dev
// convenience for manual full-stack testing. Safe to delete any time.
import { MongoMemoryServer } from "mongodb-memory-server";

const mongoServer = await MongoMemoryServer.create({
  instance: {
    port: 27017,
    dbName: "smartrays_dev",
  },
});

console.log(`MONGO_READY ${mongoServer.getUri()}smartrays_dev`);

process.on("SIGINT", async () => {
  await mongoServer.stop();
  process.exit(0);
});
