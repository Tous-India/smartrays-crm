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
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // First version — nothing to migrate yet.
  }

  fun insert(id: String, capturedAt: Long, lat: Double, lng: Double, accuracy: Float?) {
    val values = ContentValues().apply {
      put("id", id)
      put("captured_at", capturedAt)
      put("lat", lat)
      put("lng", lng)
      if (accuracy != null) put("accuracy", accuracy.toDouble()) else putNull("accuracy")
    }
    writableDatabase.insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_IGNORE)
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

  companion object {
    private const val DB_NAME = "smartrays_tracking.db"
    private const val DB_VERSION = 1
    private const val TABLE = "pings"

    @Volatile private var instance: PingQueueDb? = null

    fun get(context: Context): PingQueueDb =
      instance ?: synchronized(this) { instance ?: PingQueueDb(context.applicationContext).also { instance = it } }
  }
}
