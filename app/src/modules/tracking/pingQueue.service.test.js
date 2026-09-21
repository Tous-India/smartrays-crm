import apiClient, { refreshClient } from "../../api/apiClient";
import { flushQueue } from "./pingQueue.service";

/**
 * The queue's contract with the batch endpoint, driven through a fake
 * adapter (the same technique as apiClient.test.js) and the in-memory
 * native twin from jest.setup.js.
 */

function respond(config, status, data) {
  const response = { status, statusText: String(status), headers: {}, config, data };
  if (status >= 400) {
    const error = new Error(`status ${status}`);
    error.config = config;
    error.response = response;
    return Promise.reject(error);
  }
  return Promise.resolve(response);
}

function networkDown(config) {
  const error = new Error("Network Error");
  error.config = config;
  error.request = {};
  return Promise.reject(error);
}

function queued(count, { startMs = Date.now() - 60 * 60 * 1000 } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    capturedAt: startMs + index * 120000,
    lat: 12.9 + index * 0.0001,
    lng: 77.6,
    accuracy: index % 2 === 0 ? 8 : undefined,
  }));
}

const batches = [];

beforeEach(() => {
  batches.length = 0;
  heartbeats.length = 0;
  global.mockTrackingNative.queue = [];
  refreshClient.defaults.adapter = networkDown;
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
});

const heartbeats = [];

function serverAcceptingAll() {
  return async (config) => {
    if (config.url.includes("/attendance/heartbeat")) {
      heartbeats.push(config.url);
      return respond(config, 200, { data: { lastHeartbeatAt: new Date().toISOString() } });
    }

    const body = JSON.parse(config.data);
    batches.push(body.pings);
    return respond(config, 200, {
      data: {
        accepted: body.pings.length,
        duplicates: 0,
        rejected: [],
        results: body.pings.map((ping, index) => ({ index, clientPingId: ping.clientPingId, status: "accepted" })),
      },
    });
  };
}

test("uploads oldest first, in batches of at most 500, with client ids and accuracy, and empties the queue", async () => {
  global.mockTrackingNative.queue = queued(1203);
  const firstCapturedAt = new Date(global.mockTrackingNative.queue[0].capturedAt).toISOString();
  apiClient.defaults.adapter = serverAcceptingAll();

  const summary = await flushQueue();

  expect(batches.map((batch) => batch.length)).toEqual([500, 500, 203]);
  expect(batches[0][0]).toEqual({
    clientPingId: "id-0",
    capturedAt: firstCapturedAt,
    coords: { lat: 12.9, lng: 77.6, accuracy: 8 },
  });
  expect(batches[0][1].coords).toEqual({ lat: 12.9001, lng: 77.6 });
  expect(summary).toMatchObject({ uploaded: 1203, duplicates: 0, rejected: 0, batches: 3, stoppedBy: null, heartbeat: true });
  expect(global.mockTrackingNative.queue).toHaveLength(0);
  // One proof of life per flush, after the upload, never one per batch.
  expect(heartbeats).toHaveLength(1);
});

test("a heartbeat the server refuses (no open shift after a check-out) is not an error", async () => {
  global.mockTrackingNative.queue = queued(2);
  apiClient.defaults.adapter = async (config) => {
    if (config.url.includes("/attendance/heartbeat")) {
      return respond(config, 409, { success: false, message: "No active shift" });
    }
    return serverAcceptingAll()(config);
  };

  const summary = await flushQueue();

  expect(summary).toMatchObject({ uploaded: 2, heartbeat: false });
  expect(global.mockTrackingNative.queue).toHaveLength(0);
});

test("no heartbeat when nothing was uploaded", async () => {
  global.mockTrackingNative.queue = [];
  apiClient.defaults.adapter = serverAcceptingAll();

  await flushQueue();

  expect(heartbeats).toHaveLength(0);
});

test("drops what the server answered for — accepted, duplicate AND rejected — and logs each rejection's reason", async () => {
  global.mockTrackingNative.queue = queued(3);
  apiClient.defaults.adapter = async (config) => {
    const body = JSON.parse(config.data);
    return respond(config, 200, {
      data: {
        accepted: 1,
        duplicates: 1,
        rejected: [{ index: 2, clientPingId: body.pings[2].clientPingId, reason: "no shift at capturedAt" }],
        results: [],
      },
    });
  };

  const summary = await flushQueue();

  expect(summary).toMatchObject({ uploaded: 1, duplicates: 1, rejected: 1 });
  expect(global.mockTrackingNative.queue).toHaveLength(0);
  expect(console.log).toHaveBeenCalledWith("[tracking] ping id-2 rejected: no shift at capturedAt");
});

test("a dead network leaves the queue untouched for the next attempt", async () => {
  global.mockTrackingNative.queue = queued(4);
  apiClient.defaults.adapter = networkDown;

  const summary = await flushQueue();

  expect(summary).toMatchObject({ uploaded: 0, batches: 0, stoppedBy: "network" });
  expect(global.mockTrackingNative.queue).toHaveLength(4);
});

test("fixes older than the retention window are pruned unsent before anything is uploaded", async () => {
  const old = queued(2, { startMs: Date.now() - 50 * 24 * 60 * 60 * 1000 });
  const fresh = queued(1).map((row) => ({ ...row, id: "fresh" }));
  global.mockTrackingNative.queue = [...old, ...fresh];
  apiClient.defaults.adapter = serverAcceptingAll();

  await flushQueue();

  expect(batches).toHaveLength(1);
  expect(batches[0].map((ping) => ping.clientPingId)).toEqual(["fresh"]);
});

test("two callers during one flush share the same upload", async () => {
  global.mockTrackingNative.queue = queued(5);
  let uploads = 0;
  apiClient.defaults.adapter = async (config) => {
    if (config.url.includes("/location/pings")) {
      uploads += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return serverAcceptingAll()(config);
  };

  await Promise.all([flushQueue(), flushQueue(), flushQueue()]);

  expect(uploads).toBe(1);
  expect(heartbeats).toHaveLength(1);
});
