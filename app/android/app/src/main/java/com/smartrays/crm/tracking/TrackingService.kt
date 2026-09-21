package com.smartrays.crm.tracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.util.UUID

/**
 * The shift tracker (app-plan.md §1.3): a location-type foreground service
 * that asks Play services for a fix every `intervalMs` and writes each one to
 * the SQLite queue, then tells JavaScript about it when JavaScript is alive.
 *
 * Started at check-in and stopped at check-out by TrackingModule, never by
 * itself: whether a shift is open is the server's answer, not this service's.
 * It is deliberately NOT bound to the activity (`stopWithTask="false"` in the
 * manifest, START_STICKY here): swiping the app away leaves it running and
 * fixes keep landing in the queue. A force-stop from the settings kills it
 * and Android forbids it from restarting itself — that gap is what the web's
 * "silent" warning shows.
 *
 * Every so often, while the device has a network, it starts the headless
 * flush task so queued fixes go up even with the app closed.
 */
class TrackingService : Service() {

  private lateinit var client: FusedLocationProviderClient
  private var intervalMs: Long = DEFAULT_INTERVAL_MS
  private var lastFlushRequestAt: Long = 0L
  private var startedAt: Long = 0L

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val location = result.lastLocation ?: return
      val capturedAt = if (location.time > 0) location.time else System.currentTimeMillis()

      // Play services replays the last known fix, with its ORIGINAL timestamp,
      // the moment updates are requested. After a check-in that fix predates
      // the shift; after a sticky restart it is one we already stored. Either
      // way it is not a new capture — only fixes taken since this start count.
      if (capturedAt < startedAt) return

      val id = UUID.randomUUID().toString()
      val accuracy = if (location.hasAccuracy()) location.accuracy else null

      PingQueueDb.get(applicationContext).insert(id, capturedAt, location.latitude, location.longitude, accuracy)
      TrackingState.recordFix(applicationContext, capturedAt)
      emitToJs(id, capturedAt, location.latitude, location.longitude, accuracy)
      maybeRequestFlush()
    }
  }

  override fun onCreate() {
    super.onCreate()
    client = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopTracking()
      return START_NOT_STICKY
    }

    // A sticky restart comes with a null intent: resume with the saved interval.
    intervalMs = intent?.getLongExtra(EXTRA_INTERVAL_MS, 0L)?.takeIf { it > 0 }
      ?: TrackingState.savedIntervalMs(applicationContext)
      ?: DEFAULT_INTERVAL_MS

    startedAt = System.currentTimeMillis()
    startForegroundWithNotification()
    requestUpdates()
    TrackingState.markRunning(applicationContext, intervalMs)
    return START_STICKY
  }

  private fun startForegroundWithNotification() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Shift tracking", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while Smartrays records your location during a checked-in shift."
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = PendingIntent.getActivity(
      this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Smartrays — tracking your shift")
      .setContentText("Your location is recorded while you are checked in.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun requestUpdates() {
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateIntervalMillis(intervalMs)
      .setWaitForAccurateLocation(false)
      .build()
    try {
      client.removeLocationUpdates(callback)
      client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    } catch (error: SecurityException) {
      // The permission was revoked underneath us: nothing to record. JS reads
      // the permission state and shows "paused" (app-plan.md §1.1).
      Log.w(TAG, "Location permission missing; tracking paused", error)
    }
  }

  private fun stopTracking() {
    client.removeLocationUpdates(callback)
    TrackingState.markStopped(applicationContext)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun emitToJs(id: String, capturedAt: Long, lat: Double, lng: Double, accuracy: Float?) {
    try {
      val reactContext = (application as ReactApplication).reactHost?.currentReactContext ?: return
      if (!reactContext.hasActiveReactInstance()) return
      val params = Arguments.createMap().apply {
        putString("id", id)
        putDouble("capturedAt", capturedAt.toDouble())
        putDouble("lat", lat)
        putDouble("lng", lng)
        if (accuracy != null) putDouble("accuracy", accuracy.toDouble()) else putNull("accuracy")
      }
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_PING, params)
    } catch (error: Exception) {
      // JS is not alive — the queue has the fix; the flush task will send it.
    }
  }

  /** Starts the headless flush at most once per FLUSH_EVERY_MS, and only with a network. */
  private fun maybeRequestFlush() {
    val now = System.currentTimeMillis()
    if (now - lastFlushRequestAt < FLUSH_EVERY_MS || !hasNetwork()) return
    lastFlushRequestAt = now
    try {
      val intent = Intent(applicationContext, FlushTaskService::class.java)
      applicationContext.startService(intent)
    } catch (error: Exception) {
      Log.w(TAG, "Could not start the flush task", error)
    }
  }

  private fun hasNetwork(): Boolean {
    val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  }

  override fun onDestroy() {
    client.removeLocationUpdates(callback)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val TAG = "SmartraysTracking"
    const val EVENT_PING = "SmartraysTracking:ping"
    const val ACTION_STOP = "com.smartrays.crm.tracking.STOP"
    const val EXTRA_INTERVAL_MS = "intervalMs"
    private const val CHANNEL_ID = "smartrays_tracking"
    private const val NOTIFICATION_ID = 4101
    private const val DEFAULT_INTERVAL_MS = 2 * 60 * 1000L
    private const val FLUSH_EVERY_MS = 60 * 1000L

    fun start(context: Context, intervalMs: Long) {
      val intent = Intent(context, TrackingService::class.java).putExtra(EXTRA_INTERVAL_MS, intervalMs)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.startService(Intent(context, TrackingService::class.java).setAction(ACTION_STOP))
    }
  }
}
