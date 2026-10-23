# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# react-native-config (2026-10-23): the API address lives in BuildConfig and is
# read by reflection. Without this rule R8 strips it and the release app has
# NO API URL ("API_BASE_URL is not set").
-keep class com.smartrays.crm.BuildConfig { *; }

# WorkManager (2026-10-23, pulled in by a library since react-native-maps /
# Firebase): its Room database is created by reflection from the class name
# ("<Database>_Impl"). R8 renamed it and the release app crashed at start:
# "Failed to create an instance of class androidx.work.impl.WorkDatabase".
-keep class * extends androidx.room.RoomDatabase { *; }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keepnames class androidx.work.impl.WorkDatabase
