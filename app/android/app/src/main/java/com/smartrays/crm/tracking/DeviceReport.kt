package com.smartrays.crm.tracking

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager

/**
 * What the phone reports with each fix (2026-10-23, live status): speed in
 * m/s (when the fix has one), battery percent, charging, whether location is
 * switched on, and the network — the server turns these into Moving /
 * Battery low / Location off for the manager. Every field is optional there.
 */
data class DeviceReport(
  val speed: Float?,
  val battery: Int?,
  val charging: Boolean?,
  val locationOn: Boolean,
  val network: String,
) {
  companion object {
    fun read(context: Context, speed: Float?): DeviceReport {
      // ACTION_BATTERY_CHANGED is sticky: registering with no receiver just reads it.
      val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
      val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
      val plugged = battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
      return DeviceReport(
        speed = speed?.takeIf { it >= 0f },
        battery = if (level >= 0 && scale > 0) Math.round(level * 100f / scale) else null,
        charging = if (plugged >= 0) plugged != 0 else null,
        locationOn = isLocationOn(context),
        network = network(context),
      )
    }

    fun isLocationOn(context: Context): Boolean {
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
        manager.isLocationEnabled
      } else {
        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
      }
    }

    fun network(context: Context): String {
      val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return "none"
      return when {
        !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "none"
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
        else -> "unknown"
      }
    }
  }
}
