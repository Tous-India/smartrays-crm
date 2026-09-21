package com.smartrays.crm.tracking

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JavaScript flush (index.js registers "SmartraysFlush") without an
 * activity, so queued fixes go up while the app is closed. The task uses the
 * same API client and keychain tokens as the foreground app — the keychain
 * needs only the application context. Allowed in the foreground too: when
 * the app is open the flush is single-flight in JS anyway.
 */
class FlushTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    return HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TIMEOUT_MS, true)
  }

  companion object {
    const val TASK_NAME = "SmartraysFlush"
    private const val TIMEOUT_MS = 90_000L
  }
}
