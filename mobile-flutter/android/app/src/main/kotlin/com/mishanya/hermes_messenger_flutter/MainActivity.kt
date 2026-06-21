package com.mishanya.hermes_messenger_flutter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.abs
import android.Manifest

class MainActivity: FlutterActivity() {
    companion object {
        private const val NOTIFICATION_CHANNEL = "com.mishanya.hermes_messenger_flutter/notifications"
        private const val ATTACHMENT_CHANNEL = "com.mishanya.hermes_messenger_flutter/attachments"
        private const val AUDIO_CHANNEL = "com.mishanya.hermes_messenger_flutter/audio"
        private const val AUDIO_EVENT_CHANNEL = "com.mishanya.hermes_messenger_flutter/audio_events"
        private const val NOTIFICATION_CHANNEL_ID = "hermes_messenger_messages"
        private const val NOTIFICATION_ID_BASE = 7000
        private const val REQUEST_PICK_IMAGE = 410
        private const val REQUEST_RECORD_AUDIO = 411
        private const val MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
        private const val TARGET_IMAGE_BYTES = 1800 * 1024
        private const val MAX_AUDIO_DURATION_MS = 60_000L
    }

    private var pendingAttachmentResult: MethodChannel.Result? = null
    private var pendingRecordingResult: MethodChannel.Result? = null
    private var audioEvents: EventChannel.EventSink? = null
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private var recordingStartedAt = 0L
    private var player: MediaPlayer? = null
    private val audioHandler = Handler(Looper.getMainLooper())
    private val audioProgressRunnable = object : Runnable {
        override fun run() {
            val currentPlayer = player
            if (currentPlayer != null) {
                emitAudioState("position", currentPlayer.currentPosition, currentPlayer.duration)
                audioHandler.postDelayed(this, 250)
            }
        }
    }

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

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, AUDIO_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "startRecording" -> {
                    pendingRecordingResult = result
                    startRecordingIfNeeded()
                }
                "stopRecording" -> stopRecording(result)
                "play" -> playAudio(call, result)
                "pause" -> pausePlayback(result)
                "resume" -> resumePlayback(result)
                "stopPlayback" -> stopPlayback(result)
                "getPlaybackState" -> getPlaybackState(result)
                else -> result.notImplemented()
            }
        }

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, AUDIO_EVENT_CHANNEL).setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                audioEvents = events
            }

            override fun onCancel(arguments: Any?) {
                audioEvents = null
            }
        })
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_RECORD_AUDIO) return
        val result = pendingRecordingResult
        pendingRecordingResult = null
        if (result == null) return
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startRecording(result)
        } else {
            result.error("permission_denied", "Нужно разрешение на запись микрофона", null)
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

    private fun startRecordingIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_RECORD_AUDIO)
            return
        }
        startRecording(pendingRecordingResult ?: return)
        pendingRecordingResult = null
    }

    private fun startRecording(result: MethodChannel.Result) {
        if (recorder != null) {
            result.success(mapOf("recording" to true, "elapsed" to SystemClock.elapsedRealtime() - recordingStartedAt))
            return
        }

        try {
            recordingFile = File(cacheDir, "voice_${System.currentTimeMillis()}.m4a")
            recorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(32_000)
                setAudioSamplingRate(16_000)
                setOutputFile(recordingFile!!.absolutePath)
                setMaxDuration(MAX_AUDIO_DURATION_MS.toInt())
                setMaxFileSize((MAX_ATTACHMENT_BYTES - 1024).toLong())
                setOnErrorListener { _, _, _ -> }
                prepare()
                start()
            }
            recordingStartedAt = SystemClock.elapsedRealtime()
            result.success(mapOf("recording" to true, "elapsed" to 0L))
        } catch (error: Exception) {
            releaseRecorder()
            result.error("recording_error", error.message ?: "Не удалось начать запись", null)
        }
    }

    private fun stopRecording(result: MethodChannel.Result) {
        val currentRecorder = recorder
        val file = recordingFile
        if (currentRecorder == null || file == null) {
            result.error("not_recording", "Запись не активна", null)
            return
        }

        try {
            currentRecorder.stop()
        } catch (error: RuntimeException) {
            releaseRecorder()
            result.error("recording_error", "Не удалось завершить запись", null)
            return
        }

        try {
            currentRecorder.release()
            val bytes = file.readBytes()
            if (bytes.isEmpty() || bytes.size > MAX_ATTACHMENT_BYTES) {
                file.delete()
                result.error("recording_error", "Аудио слишком большое или пустое", null)
                return
            }
            val duration = SystemClock.elapsedRealtime() - recordingStartedAt
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            result.success(mapOf(
                "name" to "voice.m4a",
                "mime" to "audio/mp4",
                "data" to "data:audio/mp4;base64,$base64",
                "size" to bytes.size,
                "duration" to duration
            ))
            file.delete()
        } catch (error: Exception) {
            result.error("recording_error", error.message ?: "Не удалось сохранить аудио", null)
        } finally {
            releaseRecorder()
        }
    }

    private fun releaseRecorder() {
        try {
            recorder?.release()
        } catch (_: Exception) {
        }
        recorder = null
        recordingFile?.delete()
        recordingFile = null
    }

    private fun playAudio(call: MethodCall, result: MethodChannel.Result) {
        try {
            stopPlayback()
            val path = call.argument<String>("path")
            val url = call.argument<String>("url")
            if (path.isNullOrEmpty() && url.isNullOrEmpty()) {
                result.error("invalid_source", "Нет источника аудио", null)
                return
            }

            player = MediaPlayer().apply {
                if (!path.isNullOrEmpty()) {
                    setDataSource(path as String)
                } else {
                    setDataSource(url as String)
                }
                setOnCompletionListener {
                    emitAudioState("complete", 0, duration)
                    stopProgressLoop()
                }
                setOnErrorListener { _, what, extra ->
                    emitAudioState("error", currentPosition, duration, "MediaPlayer $what/$extra")
                    stopProgressLoop()
                    false
                }
                prepare()
                start()
            }
            val currentPlayer = player
            if (currentPlayer != null) {
                emitAudioState("playing", currentPlayer.currentPosition, currentPlayer.duration)
                audioHandler.postDelayed(audioProgressRunnable, 250)
                result.success(mapOf("playing" to true, "duration" to currentPlayer.duration))
            } else {
                result.error("playback_error", "Не удалось запустить аудио", null)
            }
        } catch (error: Exception) {
            stopPlayback()
            result.error("playback_error", error.message ?: "Не удалось воспроизвести аудио", null)
        }
    }

    private fun pausePlayback(result: MethodChannel.Result) {
        try {
            player?.pause()
            val currentPlayer = player
            emitAudioState("paused", currentPlayer?.currentPosition ?: 0, currentPlayer?.duration ?: 0)
            result.success(mapOf("playing" to false))
        } catch (error: Exception) {
            result.error("playback_error", error.message ?: "Не удалось поставить на паузу", null)
        }
    }

    private fun resumePlayback(result: MethodChannel.Result) {
        try {
            player?.start()
            val currentPlayer = player
            if (currentPlayer != null) {
                emitAudioState("playing", currentPlayer.currentPosition, currentPlayer.duration)
                audioHandler.postDelayed(audioProgressRunnable, 250)
            }
            result.success(mapOf("playing" to true))
        } catch (error: Exception) {
            result.error("playback_error", error.message ?: "Не удалось продолжить воспроизведение", null)
        }
    }

    private fun stopPlayback(result: MethodChannel.Result = object : MethodChannel.Result {
        override fun success(result: Any?) {}
        override fun error(errorCode: String, errorMessage: String?, errorDetails: Any?) {}
        override fun notImplemented() {}
    }) {
        stopProgressLoop()
        try {
            player?.stop()
        } catch (_: Exception) {
        }
        try {
            player?.release()
        } catch (_: Exception) {
        }
        player = null
        emitAudioState("stopped", 0, 0)
        result.success(mapOf("playing" to false))
    }

    private fun getPlaybackState(result: MethodChannel.Result) {
        val currentPlayer = player
        result.success(mapOf(
            "playing" to (currentPlayer?.isPlaying == true),
            "position" to (currentPlayer?.currentPosition ?: 0),
            "duration" to (currentPlayer?.duration ?: 0)
        ))
    }

    private fun stopProgressLoop() {
        audioHandler.removeCallbacks(audioProgressRunnable)
    }

    private fun emitAudioState(type: String, position: Int, duration: Int, error: String? = null) {
        val payload: MutableMap<String, Any> = linkedMapOf(
            "type" to type,
            "position" to position,
            "duration" to duration
        )
        if (error != null) payload["error"] = error
        audioEvents?.success(payload)
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
            NOTIFICATION_ID_BASE + abs(chatId.hashCode() % 1000)
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
