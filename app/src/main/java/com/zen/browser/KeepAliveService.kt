package com.zen.browser

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

// Foreground service: keeps the app process alive and the CPU + Wi-Fi awake while the browser is minimized
// or the screen is off, so X pages / hidden fetches keep loading in the background.
class KeepAliveService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        acquireLocks()
        return START_STICKY
    }

    private fun startAsForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL_ID, "Background running", NotificationManager.IMPORTANCE_LOW)
            ch.setShowBadge(false)
            nm.createNotificationChannel(ch)
        }
        val open = Intent(this, MainActivity::class.java)
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val b: Notification.Builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
        b.setContentTitle("ZEN BROWSER")
        b.setContentText("Running in background")
        b.setSmallIcon(android.R.drawable.stat_notify_sync)
        b.setContentIntent(pi)
        b.setOngoing(true)
        val n = b.build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    @Suppress("DEPRECATION")
    private fun acquireLocks() {
        try {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zenbrowser:bg")
                wl.setReferenceCounted(false)
                wl.acquire()
                wakeLock = wl
            }
        } catch (e: Exception) {
        }
        try {
            if (wifiLock == null) {
                val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                val l = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "zenbrowser:wifi")
                l.setReferenceCounted(false)
                l.acquire()
                wifiLock = l
            }
        } catch (e: Exception) {
        }
    }

    override fun onDestroy() {
        try {
            val w = wakeLock
            if (w != null && w.isHeld) w.release()
        } catch (e: Exception) {
        }
        try {
            val l = wifiLock
            if (l != null && l.isHeld) l.release()
        } catch (e: Exception) {
        }
        wakeLock = null
        wifiLock = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "zen_bg"
        private const val NOTIF_ID = 4711
    }
}
