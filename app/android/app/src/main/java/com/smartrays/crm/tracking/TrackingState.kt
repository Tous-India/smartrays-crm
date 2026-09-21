package com.smartrays.crm.tracking

import android.content.Context

/**
 * The little the service and the bridge share, in SharedPreferences so it
 * survives the process: whether tracking is meant to be running, at what
 * interval (a sticky restart has no intent to read it from), the last fix
 * time, and the app's own flags (disclosure answered, OEM guidance shown).
 */
object TrackingState {
  private const val PREFS = "smartrays_tracking"
  private const val KEY_RUNNING = "running"
  private const val KEY_INTERVAL_MS = "intervalMs"
  private const val KEY_LAST_FIX_AT = "lastFixAt"
  private const val FLAG_PREFIX = "flag:"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** A new run starts with no "last fix": the previous shift's is not this one's. */
  fun markRunning(context: Context, intervalMs: Long) {
    prefs(context).edit().putBoolean(KEY_RUNNING, true).putLong(KEY_INTERVAL_MS, intervalMs).remove(KEY_LAST_FIX_AT).apply()
  }

  fun markStopped(context: Context) {
    prefs(context).edit().putBoolean(KEY_RUNNING, false).apply()
  }

  fun isRunning(context: Context): Boolean = prefs(context).getBoolean(KEY_RUNNING, false)

  fun savedIntervalMs(context: Context): Long? =
    prefs(context).getLong(KEY_INTERVAL_MS, 0L).takeIf { it > 0 }

  fun recordFix(context: Context, capturedAt: Long) {
    prefs(context).edit().putLong(KEY_LAST_FIX_AT, capturedAt).apply()
  }

  fun lastFixAt(context: Context): Long? =
    prefs(context).getLong(KEY_LAST_FIX_AT, 0L).takeIf { it > 0 }

  fun setFlag(context: Context, key: String, value: String?) {
    val editor = prefs(context).edit()
    if (value == null) editor.remove(FLAG_PREFIX + key) else editor.putString(FLAG_PREFIX + key, value)
    editor.apply()
  }

  fun getFlag(context: Context, key: String): String? = prefs(context).getString(FLAG_PREFIX + key, null)
}
