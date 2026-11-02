package expo.modules.resgriddevice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Device helpers expo-file-system and expo-speech do not offer (Resgrid Omni):
 * - backup exclusion: nothing to do on Android — every variant sets `allowBackup="false"` and the data extraction rules
 *   leave the app's files out of device transfer (guarded by `packages/config-plugins/__tests__/backup-rules.test.js`);
 * - ducking: a transient "may duck" audio focus request while a turn-by-turn prompt is spoken (MapLibre plan §9.2),
 *   abandoned afterwards. A call or push-to-talk session (communication mode) is never touched.
 */
class ResgridDeviceModule : Module() {
  private var focusRequest: AudioFocusRequest? = null
  private var legacyFocusHeld = false
  private val focusListener = AudioManager.OnAudioFocusChangeListener { }

  private fun audioManager(): AudioManager? = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("ResgridDevice")

    AsyncFunction("excludeFromBackupAsync") { _: String -> false }

    AsyncFunction("isExcludedFromBackupAsync") { _: String -> true }

    AsyncFunction("beginSpeechDuckingAsync") {
      val audio = audioManager() ?: return@AsyncFunction false
      if (focusRequest != null || legacyFocusHeld) return@AsyncFunction true
      if (audio.mode == AudioManager.MODE_IN_COMMUNICATION || audio.mode == AudioManager.MODE_IN_CALL) return@AsyncFunction false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val attributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attributes)
          .setOnAudioFocusChangeListener(focusListener)
          .build()
        val granted = audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (granted) focusRequest = request
        granted
      } else {
        @Suppress("DEPRECATION")
        val granted = audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        legacyFocusHeld = granted
        granted
      }
    }

    AsyncFunction("endSpeechDuckingAsync") {
      val audio = audioManager() ?: return@AsyncFunction false
      val request = focusRequest
      if (request != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        audio.abandonAudioFocusRequest(request)
        focusRequest = null
        return@AsyncFunction true
      }
      if (legacyFocusHeld) {
        @Suppress("DEPRECATION")
        audio.abandonAudioFocus(focusListener)
        legacyFocusHeld = false
        return@AsyncFunction true
      }
      false
    }
  }
}
