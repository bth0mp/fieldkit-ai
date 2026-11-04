package ai.offgridmobile.calendar

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.ActivityNotFoundException
import android.content.ContentResolver
import android.content.Intent
import android.content.pm.PackageManager
import android.database.MatrixCursor
import android.provider.CalendarContract
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Tests for FieldkitCalendarModule's pure helpers and for the paths that settle a promise
 * without building a React Native map or array (those need the native bridge, which a unit
 * test does not load). The success path of queryInstances is exercised on a device.
 */
@Suppress("kotlin:S100") // Backtick test names are idiomatic Kotlin
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class FieldkitCalendarModuleTest {
  @Test fun `insert intent carries Long times and fields`() {
    val i = FieldkitCalendarModule.buildInsertIntent(InsertInput("Dentist", 1_700_000_000_000L, 1_700_001_800_000L, "Clinic", null, false))
    assertEquals(Intent.ACTION_INSERT, i.action)
    assertEquals(CalendarContract.Events.CONTENT_URI, i.data)
    assertEquals(1_700_000_000_000L, i.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, -1))
    assertEquals(1_700_001_800_000L, i.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, -1))
    assertEquals("Dentist", i.getStringExtra(CalendarContract.Events.TITLE))
    assertEquals("Clinic", i.getStringExtra(CalendarContract.Events.EVENT_LOCATION))
  }

  @Test fun `insert intent carries notes and the all-day flag and leaves out missing fields`() {
    val full = FieldkitCalendarModule.buildInsertIntent(InsertInput("Trip", 1L, 2L, null, "Pack the charger", true))
    assertEquals("Pack the charger", full.getStringExtra(CalendarContract.Events.DESCRIPTION))
    assertTrue(full.getBooleanExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, false))
    assertFalse(full.hasExtra(CalendarContract.Events.EVENT_LOCATION))

    val bare = FieldkitCalendarModule.buildInsertIntent(InsertInput("Call", 1L, 2L, null, null, false))
    assertFalse(bare.hasExtra(CalendarContract.Events.DESCRIPTION))
    assertFalse(bare.getBooleanExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, true))
  }

  @Test fun `limit is clamped`() {
    assertEquals(50, FieldkitCalendarModule.clampLimit(500))
    assertEquals(1, FieldkitCalendarModule.clampLimit(0))
    assertEquals(1, FieldkitCalendarModule.clampLimit(-3))
    assertEquals(20, FieldkitCalendarModule.clampLimit(20))
  }

  @Test fun `the instances uri ends with the begin and end times`() {
    val uri = FieldkitCalendarModule.instancesUri(1_700_000_000_000L, 1_700_086_400_000L)
    assertEquals(CalendarContract.Instances.CONTENT_URI.authority, uri.authority)
    assertEquals(listOf("instances", "when", "1700000000000", "1700086400000"), uri.pathSegments)
  }

  private fun cursorOf(vararg rows: Array<Any?>): MatrixCursor =
    MatrixCursor(FieldkitCalendarModule.PROJECTION).also { c -> rows.forEach { c.addRow(it) } }

  @Test fun `rows become instances in cursor order and stop at the limit`() {
    val cursor = cursorOf(
      arrayOf(7L, "Dentist", 1_000L, 2_000L, 0, "Clinic", "Personal"),
      arrayOf(8L, null, 3_000L, 4_000L, 1, "  ", null),
      arrayOf(9L, "Late", 5_000L, 6_000L, 0, null, "Work"),
    )
    val rows = FieldkitCalendarModule.readInstances(cursor, 2)
    assertEquals(2, rows.size)
    assertEquals(CalendarInstance("7-1000", "Dentist", 1_000L, 2_000L, false, "Clinic", "Personal"), rows[0])
    assertEquals(CalendarInstance("8-3000", "", 3_000L, 4_000L, true, null, null), rows[1])
  }

  @Test fun `an empty cursor gives no instances`() {
    assertTrue(FieldkitCalendarModule.readInstances(cursorOf(), 10).isEmpty())
  }

  @Test fun `queryInstances rejects PERMISSION without READ_CALENDAR and never touches the provider`() {
    val promise = mock<Promise>()
    val context = mock<ReactApplicationContext>()
    whenever(context.checkSelfPermission(Manifest.permission.READ_CALENDAR))
      .thenReturn(PackageManager.PERMISSION_DENIED)
    FieldkitCalendarModule(context).queryInstances(0.0, 1.0, 10.0, promise)
    verify(promise).reject(eq("PERMISSION"), any<String>())
    verifyNoMoreInteractions(promise)
    verify(context, never()).contentResolver
  }

  @Test fun `queryInstances rejects PERMISSION when the provider refuses the read`() {
    val promise = mock<Promise>()
    val resolver = mock<ContentResolver>()
    val context = mock<ReactApplicationContext>()
    whenever(context.checkSelfPermission(Manifest.permission.READ_CALENDAR))
      .thenReturn(PackageManager.PERMISSION_GRANTED)
    whenever(context.contentResolver).thenReturn(resolver)
    doThrow(SecurityException("revoked")).whenever(resolver)
      .query(any(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
    FieldkitCalendarModule(context).queryInstances(0.0, 1.0, 10.0, promise)
    verify(promise).reject(eq("PERMISSION"), any<String>(), any<Throwable>())
    verifyNoMoreInteractions(promise)
  }

  @Test fun `queryInstances rejects QUERY_ERROR instead of throwing on other failures`() {
    val promise = mock<Promise>()
    val resolver = mock<ContentResolver>()
    val context = mock<ReactApplicationContext>()
    whenever(context.checkSelfPermission(Manifest.permission.READ_CALENDAR))
      .thenReturn(PackageManager.PERMISSION_GRANTED)
    whenever(context.contentResolver).thenReturn(resolver)
    doThrow(IllegalStateException("provider died")).whenever(resolver)
      .query(any(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
    FieldkitCalendarModule(context).queryInstances(0.0, 1.0, 10.0, promise)
    verify(promise).reject(eq("QUERY_ERROR"), eq("provider died"), any<Throwable>())
    verifyNoMoreInteractions(promise)
  }

  @Test fun `queryInstances rejects INVALID_RANGE for a reversed or non-finite range`() {
    for ((begin, end) in listOf(5.0 to 1.0, Double.NaN to 1.0, 0.0 to Double.POSITIVE_INFINITY)) {
      val promise = mock<Promise>()
      val context = mock<ReactApplicationContext>()
      FieldkitCalendarModule(context).queryInstances(begin, end, 10.0, promise)
      verify(promise).reject(eq("INVALID_RANGE"), any<String>())
      verifyNoMoreInteractions(promise)
    }
  }

  private fun eventMap(vararg pairs: Any?) = JavaOnlyMap.of(*pairs)

  @Test fun `openInsertForm launches the insert intent and resolves true`() {
    val promise = mock<Promise>()
    val context = mock<ReactApplicationContext>()
    FieldkitCalendarModule(context).openInsertForm(
      eventMap(
        "title", "Dentist", "beginMs", 1_700_000_000_000.0, "endMs", 1_700_001_800_000.0,
        "location", "Clinic", "notes", "Bring the card", "allDay", false),
      promise)
    val captor = argumentCaptor<Intent>()
    verify(context).startActivity(captor.capture())
    val intent = captor.firstValue
    assertEquals(Intent.ACTION_INSERT, intent.action)
    assertEquals(1_700_000_000_000L, intent.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, -1))
    assertEquals(1_700_001_800_000L, intent.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, -1))
    assertEquals("Dentist", intent.getStringExtra(CalendarContract.Events.TITLE))
    assertEquals("Clinic", intent.getStringExtra(CalendarContract.Events.EVENT_LOCATION))
    assertEquals("Bring the card", intent.getStringExtra(CalendarContract.Events.DESCRIPTION))
    assertTrue(intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
    verify(promise).resolve(true)
    verifyNoMoreInteractions(promise)
  }

  @Test fun `openInsertForm starts the form from the current activity so Back returns to the app`() {
    val promise = mock<Promise>()
    val activity = mock<Activity>()
    val context = mock<ReactApplicationContext>()
    whenever(context.currentActivity).thenReturn(activity)
    FieldkitCalendarModule(context).openInsertForm(eventMap("title", "Dentist", "beginMs", 1.0, "endMs", 2.0), promise)
    val captor = argumentCaptor<Intent>()
    verify(activity).startActivity(captor.capture())
    assertEquals(Intent.ACTION_INSERT, captor.firstValue.action)
    assertEquals(0, captor.firstValue.flags and Intent.FLAG_ACTIVITY_NEW_TASK)
    verify(context, never()).startActivity(any())
    verify(promise).resolve(true)
  }

  @Test fun `openInsertForm rejects NO_CALENDAR_APP when no activity handles the intent`() {
    val promise = mock<Promise>()
    val context = mock<ReactApplicationContext>()
    doThrow(ActivityNotFoundException("none")).whenever(context).startActivity(any())
    FieldkitCalendarModule(context).openInsertForm(eventMap("title", "Dentist", "beginMs", 1.0, "endMs", 2.0), promise)
    verify(promise).reject(eq("NO_CALENDAR_APP"), any<String>(), any<Throwable>())
    verifyNoMoreInteractions(promise)
  }

  @Test fun `openInsertForm rejects OPEN_FAILED instead of throwing on other errors`() {
    val promise = mock<Promise>()
    val context = mock<ReactApplicationContext>()
    doThrow(SecurityException("denied")).whenever(context).startActivity(any())
    FieldkitCalendarModule(context).openInsertForm(eventMap("title", "Dentist", "beginMs", 1.0, "endMs", 2.0), promise)
    verify(promise).reject(eq("OPEN_FAILED"), eq("denied"), any<Throwable>())
    verifyNoMoreInteractions(promise)
  }

  @Test fun `openInsertForm rejects INVALID_EVENT without launching when the title or a time is missing`() {
    val bad = listOf(
      eventMap("beginMs", 1.0, "endMs", 2.0),
      eventMap("title", "   ", "beginMs", 1.0, "endMs", 2.0),
      eventMap("title", "Dentist", "endMs", 2.0),
      eventMap("title", "Dentist", "beginMs", 1.0),
      eventMap("title", "Dentist", "beginMs", "tomorrow", "endMs", 2.0),
      eventMap("title", "Dentist", "beginMs", Double.NaN, "endMs", 2.0),
    )
    for (event in bad) {
      val promise = mock<Promise>()
      val context = mock<ReactApplicationContext>()
      FieldkitCalendarModule(context).openInsertForm(event, promise)
      verify(promise).reject(eq("INVALID_EVENT"), any<String>())
      verifyNoMoreInteractions(promise)
      verify(context, never()).startActivity(any())
    }
  }

  @Test fun `the module is named FieldkitCalendar`() {
    assertEquals("FieldkitCalendar", FieldkitCalendarModule(mock<ReactApplicationContext>()).name)
  }
}
