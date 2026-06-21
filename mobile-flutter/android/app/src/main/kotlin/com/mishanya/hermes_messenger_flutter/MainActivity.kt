package com.mishanya.hermes_messenger_flutter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    companion object {
        private const val CHANNEL = "com.mishanya.hermes_messenger_flutter/notifications"
        private const val NOTIFICATION_CHANNEL_ID = "hermes_messenger_messages"
        private const val NOTIFICATION_ID_BASE = 7000
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "show" -> {
                    val title = call.argument<String>("title") ?: "Hermes Messenger"
                    val text = call.argument<String>("text") ?: "Новое сообщение"
                    val chatId = call.argument<String>("chatId") ?: ""
                    showNotification(title, text, chatId)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun showNotification(title: String, text: String, chatId: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createChannel(manager)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("chatId", chatId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .build()
        }

        val notificationId = if (chatId.isNotEmpty()) {
            NOTIFICATION_ID_BASE + Math.abs(chatId.hashCode() % 1000)
        } else {
            NOTIFICATION_ID_BASE
        }
        manager.notify(notificationId, notification)
    }

    private fun createChannel(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "Сообщения",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Уведомления о новых сообщениях Hermes Messenger"
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }
}
