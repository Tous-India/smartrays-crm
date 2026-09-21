package com.smartrays.crm.tracking

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap

/**
 * The JavaScript face of the tracker. Only src/modules/tracking/
 * trackingAdapter.js calls this; every screen, store and service goes
 * through the adapter, so a different engine later replaces one file.
 *
 * Nothing here decides anything: start/stop are told, the queue is handed
 * over as-is, and the flags are the app's own to read and write.
 */
class TrackingModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = NAME

  @ReactMethod
  fun start(intervalMs: Double, promise: Promise) {
    try {
      // Marked here, not only in the service: startForegroundService is
      // asynchronous, and a status read straight after start must already
      // say "running" rather than show a one-tick "paused".
      TrackingState.markRunning(context, intervalMs.toLong())
      TrackingService.start(context, intervalMs.toLong())
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("E_TRACKING_START", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      TrackingService.stop(context)
      // The service also marks itself stopped; do it here too so a status read
      // straight after resolves correctly even if the service is slow to die.
      TrackingState.markStopped(context)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("E_TRACKING_STOP", error)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val db = PingQueueDb.get(context)
      val status: WritableMap = Arguments.createMap().apply {
        putBoolean("isRunning", TrackingState.isRunning(context))
        putDouble("queuedCount", db.count().toDouble())
        val lastFix = TrackingState.lastFixAt(context)
        if (lastFix != null) putDouble("lastCapturedAt", lastFix.toDouble()) else putNull("lastCapturedAt")
        val interval = TrackingState.savedIntervalMs(context)
        if (interval != null) putDouble("intervalMs", interval.toDouble()) else putNull("intervalMs")
      }
      promise.resolve(status)
    } catch (error: Exception) {
      promise.reject("E_TRACKING_STATUS", error)
    }
  }

  /** The oldest `limit` queued fixes, as a JSON string (a batch is up to 500 rows). */
  @ReactMethod
  fun takeQueued(limit: Double, promise: Promise) {
    try {
      promise.resolve(PingQueueDb.get(context).takeOldest(limit.toInt()).toString())
    } catch (error: Exception) {
      promise.reject("E_TRACKING_TAKE", error)
    }
  }

  @ReactMethod
  fun deleteQueued(ids: ReadableArray, promise: Promise) {
    try {
      val list = (0 until ids.size()).mapNotNull { ids.getString(it) }
      promise.resolve(PingQueueDb.get(context).delete(list).toDouble())
    } catch (error: Exception) {
      promise.reject("E_TRACKING_DELETE", error)
    }
  }

  @ReactMethod
  fun pruneCapturedBefore(cutoffMs: Double, promise: Promise) {
    try {
      promise.resolve(PingQueueDb.get(context).deleteCapturedBefore(cutoffMs.toLong()).toDouble())
    } catch (error: Exception) {
      promise.reject("E_TRACKING_PRUNE", error)
    }
  }

  @ReactMethod
  fun setFlag(key: String, value: String?, promise: Promise) {
    TrackingState.setFlag(context, key, value)
    promise.resolve(null)
  }

  @ReactMethod
  fun getFlag(key: String, promise: Promise) {
    promise.resolve(TrackingState.getFlag(context, key))
  }

  // Required by NativeEventEmitter on the JS side; the service emits directly.
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}

  companion object {
    const val NAME = "SmartraysTracking"
  }
}
