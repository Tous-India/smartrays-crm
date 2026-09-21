import * as tracking from "./trackingAdapter";
import { uploadPingBatch } from "./locationApi";
import { heartbeat } from "../attendance/api/attendanceApi";
import { PING_BATCH_LIMIT, PING_RETENTION_DAYS } from "../../constants/tracking.constants";
import { hasServerResponse } from "../../utils/apiError.utils";

/**
 * The offline queue's way out (app-plan.md §1.5). Oldest first, at most
 * PING_BATCH_LIMIT per request, and a row leaves the queue only once the
 * server has answered for it: `accepted` and `duplicate` mean delivered,
 * `rejected` is dropped with its reason logged (typically "no shift at
 * capturedAt" — the phone checked out before the batch went up). A network
 * failure leaves the queue untouched for the next attempt.
 *
 * A landed batch is also the app's proof of life: the server's connectivity-
 * gap rule (final-plan.md §6.5) counts silence from the last heartbeat, and
 * the web sends one on a timer. Here the upload itself is the moment the
 * device demonstrably reached the server, so one heartbeat follows each
 * successful flush; the server's 409 after a check-out is ignored.
 *
 * Single-flight: the foreground app and the headless flush task share this
 * module, so only one upload runs at a time whoever asked.
 */

let flushInFlight = null;

export function flushQueue() {
  if (!flushInFlight) {
    flushInFlight = performFlush().finally(() => {
      flushInFlight = null;
    });
  }

  return flushInFlight;
}

async function performFlush() {
  const summary = { uploaded: 0, duplicates: 0, rejected: 0, batches: 0, stoppedBy: null };

  await tracking.pruneCapturedBefore(Date.now() - PING_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Loop until a batch comes back short — the queue is then empty.
  for (;;) {
    const rows = await tracking.takeQueued(PING_BATCH_LIMIT);

    if (rows.length === 0) {
      return summary;
    }

    const pings = rows.map((row) => ({
      clientPingId: row.id,
      capturedAt: new Date(row.capturedAt).toISOString(),
      coords: {
        lat: row.lat,
        lng: row.lng,
        ...(typeof row.accuracy === "number" ? { accuracy: row.accuracy } : {}),
      },
    }));

    let report;

    try {
      const response = await uploadPingBatch(pings);
      report = response.data.data;
    } catch (error) {
      // A server answer (a 4xx we did not expect, or the session gone after a
      // failed refresh) ends this pass; the rows stay for the next one. So
      // does a dead network. Neither drops anything.
      summary.stoppedBy = hasServerResponse(error) ? `HTTP ${error.response.status}` : "network";
      return summary;
    }

    summary.batches += 1;
    summary.uploaded += report.accepted;
    summary.duplicates += report.duplicates;
    summary.rejected += report.rejected.length;

    report.rejected.forEach((entry) => {
      console.log(`[tracking] ping ${entry.clientPingId} rejected: ${entry.reason}`);
    });

    // Every row the server answered for is done with, whatever the answer.
    await tracking.deleteQueued(rows.map((row) => row.id));

    if (rows.length < PING_BATCH_LIMIT) {
      await sendHeartbeat(summary);
      return summary;
    }
  }
}

async function sendHeartbeat(summary) {
  try {
    await heartbeat();
    summary.heartbeat = true;
  } catch (error) {
    // No open shift (409) or a dropped request: nothing to record. The next
    // flush tries again; the fixes themselves are already safe.
    summary.heartbeat = false;
  }
}
