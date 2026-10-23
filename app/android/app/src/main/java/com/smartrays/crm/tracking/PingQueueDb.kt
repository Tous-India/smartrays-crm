package com.smartrays.crm.tracking

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/**
 * The offline ping queue (app-plan.md §1.5): every fix the service captures
 * is written here first, by the service itself, so nothing is lost when the
 * JavaScript side is not running. The JS flush reads the oldest rows, uploads
 * them as a batch, and deletes what the server has answered for. SQLite on
 * purpose — it is built into Android, survives restarts and reboots, and can
 * be written from the service with no JavaScript alive.
 *
 * Version 2 (2026-10-23, live status): each fix also keeps what the phone
 * reported when it was taken — speed, battery, charging, location on,
 * network — and a second table queues "location off / on" events.
 */
class PingQueueDb(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE $TABLE (
        id TEXT PRIMARY KEY NOT NULL,
        captured_at INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy REAL
      )
      """.trimIndent()
    )
    db.execSQL("CREATE INDEX idx_${TABLE}_captured_at ON $TABLE(captured_at)")
    addDeviceColumns(db)
    createEventsTable(db)
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // 1 → 2 (2026-10-23): the device report and the events queue. Queued fixes are kept.
    if (oldVersion < 2) {
      addDeviceColumns(db)
      createEventsTable(db)
    }
  }

  private fun addDeviceColumns(db: SQLiteDatabase) {
    db.execSQL("ALTER TABLE $TABLE ADD COLUMN speed REAL")
    db.execSQL("ALTER TABLE $TABLE ADD COLUMN battery INTEGER")
    db.execSQL("ALTER TABLE $TABLE ADD COLUMN charging INTEGER")
    db.execSQL("ALTER TABLE $TABLE ADD COLUMN location_on INTEGER")
    db.execSQL("ALTER TABLE $TABLE ADD COLUMN network TEXT")
  }

  private fun createEventsTable(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS $EVENTS (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        reason TEXT,
        at INTEGER NOT NULL
      )
      """.trimIndent()
    )
  }

  fun insert(id: String, capturedAt: Long, lat: Double, lng: Double, accuracy: Float?, device: DeviceReport? = null) {
    val values = ContentValues().apply {
      put("id", id)
      put("captured_at", capturedAt)
      put("lat", lat)
      put("lng", lng)
      if (accuracy != null) put("accuracy", accuracy.toDouble()) else putNull("accuracy")
      if (device != null) {
        device.speed?.let { put("speed", it.toDouble()) }
        device.battery?.let { put("battery", it) }
        device.charging?.let { put("charging", if (it) 1 else 0) }
        put("location_on", if (device.locationOn) 1 else 0)
        put("network", device.network)
      }
    }
    writableDatabase.insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_IGNORE)
  }

  /** Queues "location_off" / "location_on" (reason: gps_off, permission_revoked, unknown). */
  fun insertEvent(id: String, type: String, reason: String?, at: Long) {
    val values = ContentValues().apply {
      put("id", id)
      put("type", type)
      if (reason != null) put("reason", reason) else putNull("reason")
      put("at", at)
    }
    writableDatabase.insertWithOnConflict(EVENTS, null, values, SQLiteDatabase.CONFLICT_IGNORE)
  }

  /** Oldest first: [{ id, type, reason?, at }]. */
  fun takeEvents(limit: Int): JSONArray {
    val rows = JSONArray()
    readableDatabase.query(EVENTS, null, null, null, null, null, "at ASC", limit.toString()).use { cursor ->
      while (cursor.moveToNext()) {
        val row = JSONObject()
        row.put("id", cursor.getString(cursor.getColumnIndexOrThrow("id")))
        row.put("type", cursor.getString(cursor.getColumnIndexOrThrow("type")))
        val reasonIndex = cursor.getColumnIndexOrThrow("reason")
        if (!cursor.isNull(reasonIndex)) row.put("reason", cursor.getString(reasonIndex))
        row.put("at", cursor.getLong(cursor.getColumnIndexOrThrow("at")))
        rows.put(row)
      }
    }
    return rows
  }

  fun deleteEvents(ids: List<String>): Int {
    if (ids.isEmpty()) return 0
    return ids.chunked(500).sumOf { chunk ->
      writableDatabase.delete(EVENTS, "id IN (${chunk.joinToString(",") { "?" }})", chunk.toTypedArray())
    }
  }

  fun count(): Long {
    readableDatabase.rawQuery("SELECT COUNT(*) FROM $TABLE", null).use { cursor ->
      return if (cursor.moveToFirst()) cursor.getLong(0) else 0
    }
  }

  fun lastCapturedAt(): Long? {
    readableDatabase.rawQuery("SELECT MAX(captured_at) FROM $TABLE", null).use { cursor ->
      return if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else null
    }
  }

  /** Oldest first — the order the server wants a batch in. */
  fun takeOldest(limit: Int): JSONArray {
    val rows = JSONArray()
    readableDatabase.query(TABLE, null, null, null, null, null, "captured_at ASC", limit.toString()).use { cursor ->
      while (cursor.moveToNext()) {
        val row = JSONObject()
        row.put("id", cursor.getString(cursor.getColumnIndexOrThrow("id")))
        row.put("capturedAt", cursor.getLong(cursor.getColumnIndexOrThrow("captured_at")))
        row.put("lat", cursor.getDouble(cursor.getColumnIndexOrThrow("lat")))
        row.put("lng", cursor.getDouble(cursor.getColumnIndexOrThrow("lng")))
        val accuracyIndex = cursor.getColumnIndexOrThrow("accuracy")
        if (!cursor.isNull(accuracyIndex)) row.put("accuracy", cursor.getDouble(accuracyIndex))
        cursor.optional("speed")?.let { row.put("speed", cursor.getDouble(it)) }
        cursor.optional("battery")?.let { row.put("battery", cursor.getInt(it)) }
        cursor.optional("charging")?.let { row.put("charging", cursor.getInt(it) == 1) }
        cursor.optional("location_on")?.let { row.put("locationOn", cursor.getInt(it) == 1) }
        cursor.optional("network")?.let { row.put("network", cursor.getString(it)) }
        rows.put(row)
      }
    }
    return rows
  }

  fun delete(ids: List<String>): Int {
    if (ids.isEmpty()) return 0
    var deleted = 0
    val db = writableDatabase
    db.beginTransaction()
    try {
      ids.chunked(500).forEach { chunk ->
        val placeholders = chunk.joinToString(",") { "?" }
        deleted += db.delete(TABLE, "id IN ($placeholders)", chunk.toTypedArray())
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    return deleted
  }

  /** Drops fixes the server would purge on arrival anyway (app-plan.md §1.5). */
  fun deleteCapturedBefore(cutoffMs: Long): Int {
    return writableDatabase.delete(TABLE, "captured_at < ?", arrayOf(cutoffMs.toString()))
  }

  /** The column's index when it exists and holds a value; null otherwise. */
  private fun android.database.Cursor.optional(column: String): Int? =
    getColumnIndex(column).takeIf { it >= 0 && !isNull(it) }

  companion object {
    private const val DB_NAME = "smartrays_tracking.db"
    private const val DB_VERSION = 2
    private const val TABLE = "pings"
    private const val EVENTS = "status_events"

    @Volatile private var instance: PingQueueDb? = null

    fun get(context: Context): PingQueueDb =
      instance ?: synchronized(this) { instance ?: PingQueueDb(context.applicationContext).also { instance = it } }
  }
}
