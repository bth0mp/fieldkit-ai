package ai.offgridmobile.speech

import android.app.Application
import android.speech.tts.TextToSpeech
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Tests for the pure helpers in FieldkitSpeechModule's companion object. The TextToSpeech
 * engine itself is a system service and is exercised on a device, not here.
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
}
