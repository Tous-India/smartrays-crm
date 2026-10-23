package com.smartrays.crm.tracking

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Brings tracking back after a reboot (app-plan.md §1.3). A reboot kills the
 * foreground service and Android does not restart it on its own, so the
 * shift would go silent until the employee happened to open the app. The
 * one thing this receiver reads is the flag TrackingService keeps in
 * SharedPreferences: "a shift was open and tracking was running" — no flag,
 * nothing happens. Whether the shift is STILL open is the server's answer:
 * the restarted service runs the headless flush on its first fix, and that
 * flush asks the server and stops the engine if the shift was closed in the
 * meantime (flushTask.js).
 *
 * Android 12+ forbids most foreground-service starts from the background;
 * BOOT_COMPLETED is one of the listed exemptions, and Android 14/15's
 * narrower boot rules exclude dataSync, camera, media and microphone types
 * — not location. If the OS still refuses (an OEM restriction, or a rule in
 * a later release), the refusal is caught and a notification asks the
 * employee to open the app, which resumes tracking through the ordinary
 * shift sync on launch.
 *
 * The same after an app UPDATE (2026-10-23): installing a new version kills
 * the service like a reboot does, and an update from the Play Store can land
 * mid-shift. MY_PACKAGE_REPLACED is also on Android's list of broadcasts
 * allowed to start a foreground service.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in BOOT_ACTIONS) return

    if (!TrackingState.isRunning(context)) {
      Log.i(TrackingService.TAG, "Boot: no shift was being tracked; nothing to resume")
      return
    }

    val intervalMs = TrackingState.savedIntervalMs(context) ?: TrackingService.DEFAULT_INTERVAL_MS

    try {
      TrackingService.start(context, intervalMs)
      Log.i(TrackingService.TAG, "Boot: tracking service restarted (interval ${intervalMs}ms)")
    } catch (error: Exception) {
      // ForegroundServiceStartNotAllowedException (API 31+) or an OEM's own
      // IllegalStateException: the OS would not let a background start through.
      Log.w(TrackingService.TAG, "Boot: OS refused to restart tracking (${error.javaClass.simpleName})", error)
      askToOpenTheApp(context)
    }
  }

  private fun askToOpenTheApp(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Shift tracking alerts", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Shown when Smartrays needs you to open the app to keep tracking your shift."
      }
      manager.createNotificationChannel(channel)
    }

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    val contentIntent = PendingIntent.getActivity(
      context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("Open Smartrays to resume tracking")
      .setContentText("Your phone restarted during your shift. Tap to continue tracking your location.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentIntent(contentIntent)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()

    try {
      manager.notify(NOTIFICATION_ID, notification)
    } catch (error: SecurityException) {
      // Notifications refused as well: the shift card says "paused" on the next launch.
      Log.w(TrackingService.TAG, "Boot: could not post the resume notification", error)
    }
  }

  companion object {
    private const val CHANNEL_ID = "smartrays_tracking_alerts"
    private const val NOTIFICATION_ID = 4102
    private val BOOT_ACTIONS = setOf(
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      // Some OEMs (HTC, a few others) send this instead of BOOT_COMPLETED on a fast boot.
      "android.intent.action.QUICKBOOT_POWERON",
    )
  }
}
