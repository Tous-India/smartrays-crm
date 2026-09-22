package com.smartrays.crm.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * The channels push notifications land in (STEP 4), created once at app
 * start so they exist before the first FCM message arrives — Android drops a
 * notification whose channel does not exist. One per category, named for
 * the settings screen, so a user can mute leave or attendance chatter
 * without muting the tracking notification: that one lives in the channel
 * TrackingService owns ("smartrays_tracking") and is not touched here.
 *
 * The ids are the contract with the backend's push.service.js, which sets
 * `android.notification.channelId` per notification type.
 */
object NotificationChannels {
  private data class Spec(val id: String, val name: String, val description: String, val importance: Int)

  private val SPECS = listOf(
    Spec("smartrays_work", "Work assignments", "A service assigned or reassigned to you.", NotificationManager.IMPORTANCE_HIGH),
    Spec("smartrays_leave", "Leave", "Decisions on your leave requests, and requests from your team.", NotificationManager.IMPORTANCE_DEFAULT),
    Spec("smartrays_attendance", "Attendance", "Check-ins and check-outs on your team.", NotificationManager.IMPORTANCE_LOW),
    Spec("smartrays_reminders", "Shift reminders", "A reminder when a shift has been left open.", NotificationManager.IMPORTANCE_HIGH),
    Spec("smartrays_general", "Other", "Everything else from Smartrays.", NotificationManager.IMPORTANCE_DEFAULT),
  )

  fun create(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    SPECS.forEach { spec ->
      val channel = NotificationChannel(spec.id, spec.name, spec.importance).apply { description = spec.description }
      manager.createNotificationChannel(channel)
    }
  }
}
