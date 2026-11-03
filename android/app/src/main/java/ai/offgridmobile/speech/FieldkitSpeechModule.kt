package ai.offgridmobile.speech

import ai.offgridmobile.SafePromise
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.atomic.AtomicInteger

/**
 * Text-to-speech over the system [TextToSpeech] engine. Replies are only ever spoken by voices
 * that work offline: [speak] rejects with NOT_OFFLINE for any other voice, so a reply never
 * leaves the device. The JS side filters the same way before it calls [setVoice].
 */
class FieldkitSpeechModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mainHandler = Handler(Looper.getMainLooper())

    // Bumped by every init() and by invalidate(), so a bind that finishes late can tell it is stale.
    private val generation = AtomicInteger()

    @Volatile private var tts: TextToSpeech? = null

    // Audio focus state, guarded by focusLock. Callbacks arrive on binder threads.
    private val focusLock = Any()
    private val queuedIds = mutableSetOf<String>()
    private var holdsFocus = false
    private var focusRequest: AudioFocusRequest? = null
    private val focusListener = AudioManager.OnAudioFocusChangeListener { }

    override fun getName(): String = NAME

    override fun invalidate() {
        generation.incrementAndGet()
        releaseEngine()
        super.invalidate()
    }

    // -------------------------------------------------------------------------
    // React methods
    // -------------------------------------------------------------------------

    @ReactMethod
    fun init(enginePackage: String?, promise: Promise) {
        val safe = SafePromise(promise, NAME)
        val myGeneration = generation.incrementAndGet()
        releaseEngine()
        // Bind on the main thread: the init callback also arrives there, so it cannot run
        // before this block has finished storing the instance.
        UiThreadUtil.runOnUiThread {
            try {
                val (installed, defaultEngine) = probeEngines()
                val pkg = pickEngine(enginePackage, installed, defaultEngine)
                if (pkg == null) {
                    finishUnbound(safe, null, usedFallback = false, reason = "no engine installed")
                } else {
                    connect(pkg, installed, usedFallback = false, myGeneration, safe)
                }
            } catch (e: Exception) {
                Log.w(NAME, "init failed", e)
                safe.reject("INIT_ERROR", e.message ?: "init failed", e)
            }
        }
    }

    @ReactMethod
    fun getVoices(promise: Promise) {
        val engine = tts ?: return promise.reject("NOT_BOUND", "Speech engine is not bound")
        try {
            val result = Arguments.createArray()
            for (voice in engine.voices.orEmpty()) {
                result.pushMap(Arguments.createMap().apply {
                    putString("id", voice.name)
                    putString("name", voice.locale.displayName)
                    putString("language", voice.locale.toLanguageTag())
                    putBoolean("networkRequired", voice.isNetworkConnectionRequired)
                    putBoolean("notInstalled", isNotInstalled(voice.features))
                    putDouble("quality", voice.quality.toDouble())
                })
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("VOICES_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setVoice(id: String, promise: Promise) {
        val engine = tts ?: return promise.reject("NOT_BOUND", "Speech engine is not bound")
        try {
            val voice = engine.voices.orEmpty().firstOrNull { it.name == id }
            val usable = voice != null && isUsableOffline(voice.isNetworkConnectionRequired, voice.features)
            promise.resolve(usable && engine.setVoice(voice) == TextToSpeech.SUCCESS)
        } catch (e: Exception) {
            promise.reject("VOICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun speak(text: String, utteranceId: String, rate: Double, pitch: Double, promise: Promise) {
        val engine = tts ?: return promise.reject("NOT_BOUND", "Speech engine is not bound")
        try {
            // An unknown current voice counts as not offline: nothing is spoken unless it is verified.
            val voice = engine.voice ?: engine.defaultVoice
            if (voice == null || !isUsableOffline(voice.isNetworkConnectionRequired, voice.features)) {
                return promise.reject("NOT_OFFLINE", "The current voice needs a network connection or is not installed")
            }
            engine.setSpeechRate(rate.toFloat())
            engine.setPitch(pitch.toFloat())
            synchronized(focusLock) { queuedIds.add(utteranceId) }
            if (engine.speak(text, TextToSpeech.QUEUE_ADD, null, utteranceId) != TextToSpeech.SUCCESS) {
                finishUtterance(utteranceId)
                return promise.reject("SPEAK_ERROR", "speak() failed for ${text.length} characters")
            }
            promise.resolve(null)
        } catch (e: Exception) {
            finishUtterance(utteranceId)
            promise.reject("SPEAK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            tts?.stop()
            synchronized(focusLock) {
                queuedIds.clear()
                abandonFocus()
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openVoiceInstaller(promise: Promise) {
        try {
            val intent = Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: ActivityNotFoundException) {
            promise.reject("NO_INSTALLER", "No voice installer is available on this device", e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) { /* required for RN event emitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* required for RN event emitter */ }

    // -------------------------------------------------------------------------
    // Engine binding
    // -------------------------------------------------------------------------

    /**
     * Installed engine packages and the system default, read from a throwaway instance:
     * [TextToSpeech.getEngines] and [TextToSpeech.getDefaultEngine] are instance methods that
     * work before the service has bound.
     */
    private fun probeEngines(): Pair<List<String>, String?> {
        val probe = TextToSpeech(reactApplicationContext, null)
        try {
            return probe.engines.map { it.name } to probe.defaultEngine
        } finally {
            probe.shutdown()
        }
    }

    private fun connect(
        pkg: String,
        installed: List<String>,
        usedFallback: Boolean,
        myGeneration: Int,
        promise: SafePromise,
    ) {
        // When the service cannot be bound at all the constructor calls the listener before it
        // returns, so `engine` is still null then; the listener only uses it for shutdown().
        var engine: TextToSpeech? = null
        engine = TextToSpeech(reactApplicationContext, TextToSpeech.OnInitListener { status ->
            onEngineInit(engine, status, pkg, installed, usedFallback, myGeneration, promise)
        }, pkg)
    }

    private fun onEngineInit(
        engine: TextToSpeech?,
        status: Int,
        pkg: String,
        installed: List<String>,
        usedFallback: Boolean,
        myGeneration: Int,
        promise: SafePromise,
    ) {
        try {
            if (myGeneration != generation.get()) {
                engine?.shutdown()
                promise.reject("INIT_SUPERSEDED", "init() was called again or the module was destroyed")
                return
            }
            if (engine != null && status == TextToSpeech.SUCCESS) {
                engine.setOnUtteranceProgressListener(progressListener)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    engine.setAudioAttributes(speechAttributes())
                }
                tts = engine
                val max = TextToSpeech.getMaxSpeechInputLength()
                Log.i(NAME, "bound=true engine=$pkg maxInput=$max fallback=$usedFallback")
                promise.resolve(initResult(true, pkg, max))
                return
            }
            engine?.shutdown()
            if (pkg == SAMSUNG_ENGINE && !usedFallback && GOOGLE_ENGINE in installed) {
                connect(GOOGLE_ENGINE, installed, usedFallback = true, myGeneration, promise)
            } else {
                finishUnbound(promise, pkg, usedFallback, reason = "init status $status")
            }
        } catch (e: Exception) {
            Log.w(NAME, "init failed", e)
            promise.reject("INIT_ERROR", e.message ?: "init failed", e)
        }
    }

    private fun finishUnbound(promise: SafePromise, pkg: String?, usedFallback: Boolean, reason: String) {
        val max = TextToSpeech.getMaxSpeechInputLength()
        Log.w(NAME, "bound=false engine=$pkg maxInput=$max fallback=$usedFallback ($reason)")
        promise.resolve(initResult(false, null, max))
    }

    private fun initResult(bound: Boolean, pkg: String?, max: Int): WritableMap =
        Arguments.createMap().apply {
            putBoolean("bound", bound)
            putString("enginePackage", pkg)
            putDouble("maxInputLength", max.toDouble())
        }

    private fun releaseEngine() {
        val engine = tts
        tts = null
        try {
            engine?.shutdown()
        } catch (e: Exception) {
            Log.w(NAME, "engine shutdown failed", e)
        }
        synchronized(focusLock) {
            queuedIds.clear()
            abandonFocus()
        }
    }

    // -------------------------------------------------------------------------
    // Utterance events and audio focus
    // -------------------------------------------------------------------------

    private val progressListener = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
            val id = utteranceId ?: return
            requestFocus()
            emit(EVENT_START) { putString("utteranceId", id) }
        }

        override fun onDone(utteranceId: String?) {
            val id = utteranceId ?: return
            finishUtterance(id)
            emit(EVENT_DONE) { putString("utteranceId", id) }
        }

        override fun onStop(utteranceId: String?, interrupted: Boolean) {
            val id = utteranceId ?: return
            finishUtterance(id)
            emit(EVENT_STOPPED) {
                putString("utteranceId", id)
                putBoolean("interrupted", interrupted)
            }
        }

        @Deprecated("Superseded by onError(String, Int)")
        override fun onError(utteranceId: String?) = onError(utteranceId, TextToSpeech.ERROR)

        override fun onError(utteranceId: String?, errorCode: Int) {
            val id = utteranceId ?: return
            finishUtterance(id)
            emit(EVENT_ERROR) {
                putString("utteranceId", id)
                putInt("code", errorCode)
            }
        }
    }

    /** Forgets a finished utterance and gives up audio focus once nothing is left to speak. */
    private fun finishUtterance(utteranceId: String) {
        synchronized(focusLock) {
            queuedIds.remove(utteranceId)
            if (queuedIds.isEmpty()) abandonFocus()
        }
    }

    private fun requestFocus() {
        synchronized(focusLock) {
            if (holdsFocus) return
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(speechAttributes())
                    .setOnAudioFocusChangeListener(focusListener)
                    .build()
                audioManager.requestAudioFocus(request)
                focusRequest = request
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(
                    focusListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK,
                )
            }
            holdsFocus = true
        }
    }

    private fun abandonFocus() {
        synchronized(focusLock) {
            if (!holdsFocus) return
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
                focusRequest = null
            } else {
                @Suppress("DEPRECATION")
                audioManager.abandonAudioFocus(focusListener)
            }
            holdsFocus = false
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun speechAttributes(): AudioAttributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()

    /** Same guarded emit as DownloadEventBridge: skipped while no React instance is alive, sent from the main looper. */
    private fun emit(eventName: String, build: WritableMap.() -> Unit) {
        val reactContext = reactApplicationContext
        if (!reactContext.hasActiveReactInstance()) return
        mainHandler.post {
            if (!reactContext.hasActiveReactInstance()) return@post
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, Arguments.createMap().apply(build))
        }
    }

    companion object {
        const val NAME = "FieldkitSpeech"
        const val EVENT_START = "FieldkitSpeech_start"
        const val EVENT_DONE = "FieldkitSpeech_done"
        const val EVENT_STOPPED = "FieldkitSpeech_stopped"
        const val EVENT_ERROR = "FieldkitSpeech_error"
        private const val SAMSUNG_ENGINE = "com.samsung.SMT"
        private const val GOOGLE_ENGINE = "com.google.android.tts"

        /** A voice may be spoken only when it needs no network and its data is on the device. */
        internal fun isUsableOffline(networkRequired: Boolean, features: Set<String>?): Boolean =
            !networkRequired && !isNotInstalled(features)

        internal fun isNotInstalled(features: Set<String>?): Boolean =
            features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true

        /** The requested engine when it is installed, otherwise the system default (null when there is none). */
        internal fun pickEngine(requested: String?, installed: List<String>, defaultEngine: String?): String? =
            requested?.takeIf { it in installed } ?: defaultEngine
    }
}
