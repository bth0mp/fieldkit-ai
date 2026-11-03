package ai.offgridmobile.speech

import android.app.Application
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Tests for the pure helpers in FieldkitSpeechModule's companion object and for
 * openVoiceInstaller, which needs no engine. The TextToSpeech engine itself is a system
 * service and is exercised on a device, not here.
 */
@Suppress("kotlin:S100") // Backtick test names are idiomatic Kotlin
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class FieldkitSpeechModuleTest {
  @Test fun `offline only when no network and installed`() {
    assertTrue(FieldkitSpeechModule.isUsableOffline(false, setOf()))
    assertFalse(FieldkitSpeechModule.isUsableOffline(true, setOf()))
    assertFalse(FieldkitSpeechModule.isUsableOffline(false, setOf(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))
    assertTrue(FieldkitSpeechModule.isUsableOffline(false, null))
    assertTrue(FieldkitSpeechModule.isNotInstalled(setOf(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))
    assertFalse(FieldkitSpeechModule.isNotInstalled(null))
  }

  @Test fun `falls back to Google when Samsung requested but not installed`() {
    assertEquals("com.google.android.tts",
      FieldkitSpeechModule.pickEngine("com.samsung.SMT", listOf("com.google.android.tts"), "com.google.android.tts"))
    assertNull(FieldkitSpeechModule.pickEngine(null, emptyList(), null))
  }

  @Test fun `keeps a requested engine that is installed and otherwise uses the default`() {
    val installed = listOf("com.samsung.SMT", "com.google.android.tts")
    assertEquals("com.samsung.SMT", FieldkitSpeechModule.pickEngine("com.samsung.SMT", installed, "com.google.android.tts"))
    assertEquals("com.google.android.tts", FieldkitSpeechModule.pickEngine(null, installed, "com.google.android.tts"))
  }

  @Suppress("DEPRECATION")
  @Test fun `speak asks the engine for embedded synthesis`() {
    val params = FieldkitSpeechModule.speakParams()
    assertEquals("true", params.getString(TextToSpeech.Engine.KEY_FEATURE_EMBEDDED_SYNTHESIS))
  }

  @Test fun `voice log line carries the name, network flag and sorted features`() {
    assertEquals(
      "voice=en-us-x-sfg#male_1-local networkRequired=false features=[a_feature, z_feature]",
      FieldkitSpeechModule.describeVoice("en-us-x-sfg#male_1-local", false, setOf("z_feature", "a_feature")))
    assertEquals(
      "voice=v networkRequired=true features=null",
      FieldkitSpeechModule.describeVoice("v", true, null))
  }

  @Test fun `openVoiceInstaller launches the install-data intent`() {
    val promise = mock<Promise>()
    val context = mock<ReactApplicationContext>()
    FieldkitSpeechModule(context).openVoiceInstaller(promise)
    val captor = argumentCaptor<Intent>()
    verify(context).startActivity(captor.capture())
    assertEquals(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA, captor.firstValue.action)
    verify(promise).resolve(null)
    verifyNoMoreInteractions(promise)
  }

  @Test fun `openVoiceInstaller rejects NO_INSTALLER when no activity handles the intent`() {
    val promise = mock<Promise>()
    val context = mock<ReactApplicationContext>()
    doThrow(ActivityNotFoundException("none")).whenever(context).startActivity(any())
    FieldkitSpeechModule(context).openVoiceInstaller(promise)
    verify(promise).reject(eq("NO_INSTALLER"), any<String>(), any<Throwable>())
    verifyNoMoreInteractions(promise)
  }

  @Test fun `openVoiceInstaller rejects INSTALLER_FAILED instead of throwing on other errors`() {
    val promise = mock<Promise>()
    val context = mock<ReactApplicationContext>()
    doThrow(SecurityException("denied")).whenever(context).startActivity(any())
    FieldkitSpeechModule(context).openVoiceInstaller(promise)
    verify(promise).reject(eq("INSTALLER_FAILED"), eq("denied"), any<Throwable>())
    verifyNoMoreInteractions(promise)
  }
}
