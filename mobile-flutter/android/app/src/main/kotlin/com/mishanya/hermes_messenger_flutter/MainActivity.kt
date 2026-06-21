package com.mishanya.hermes_messenger_flutter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import kotlin.math.abs

class MainActivity: FlutterActivity() {
    companion object {
        private const val NOTIFICATION_CHANNEL = "com.mishanya.hermes_messenger_flutter/notifications"
        private const val ATTACHMENT_CHANNEL = "com.mishanya.hermes_messenger_flutter/attachments"
        private const val NOTIFICATION_CHANNEL_ID = "hermes_messenger_messages"
        private const val NOTIFICATION_ID_BASE = 7000
        private const val REQUEST_PICK_IMAGE = 410
        private const val MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
        private const val TARGET_IMAGE_BYTES = 1800 * 1024
    }

    private var pendingAttachmentResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, NOTIFICATION_CHANNEL).setMethodCallHandler { call, result ->
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

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, ATTACHMENT_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "pickImage" -> {
                    pendingAttachmentResult = result
                    pickImage()
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_PICK_IMAGE) return
        val result = pendingAttachmentResult
        pendingAttachmentResult = null
        if (result == null) return

        if (resultCode != RESULT_OK || data?.data == null) {
            result.error("cancelled", "Выбор фото отменён", null)
            return
        }

        try {
            result.success(encodeImage(data.data!!))
        } catch (error: Exception) {
            result.error("attachment_error", error.message ?: "Не удалось обработать фото", null)
        }
    }

    private fun pickImage() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        startActivityForResult(Intent.createChooser(intent, "Выберите фото"), REQUEST_PICK_IMAGE)
    }

    private fun encodeImage(uri: Uri): Map<String, Any> {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val width = bounds.outWidth
        val height = bounds.outHeight
        if (width <= 0 || height <= 0) throw Exception("Не удалось прочитать изображение")

        val options = BitmapFactory.Options().apply {
            inJustDecodeBounds = false
            inSampleSize = calculateSampleSize(width, height, 1600)
        }

        val bitmap = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
            ?: throw Exception("Не удалось открыть изображение")

        val output = ByteArrayOutputStream()
        var quality = 85
        do {
            output.reset()
            val ok = bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)
            if (!ok) throw Exception("Не удалось сжать изображение")
            if (output.size() <= TARGET_IMAGE_BYTES || quality <= 40) break
            quality -= 10
        } while (quality >= 40)

        if (output.size() > MAX_ATTACHMENT_BYTES) {
            bitmap.recycle()
            throw Exception("Фото слишком большое. Выберите изображение меньше 2 МБ")
        }

        val bytes = output.toByteArray()
        bitmap.recycle()
        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return mapOf(
            "name" to "photo.jpg",
            "mime" to "image/jpeg",
            "data" to "data:image/jpeg;base64,$base64",
            "size" to bytes.size
        )
    }

    private fun calculateSampleSize(width: Int, height: Int, maxSize: Int): Int {
        var sampleSize = 1
        while (maxOf(width / sampleSize, height / sampleSize) > maxSize) {
            sampleSize *= 2
        }
        return sampleSize
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
            NOTIFICATION_ID_BASE + kotlin.math.abs(chatId.hashCode() % 1000)
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
