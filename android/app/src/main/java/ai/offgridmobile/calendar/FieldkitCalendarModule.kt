package ai.offgridmobile.calendar

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.CalendarContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

/** The fields of a new event, as handed to the Calendar app's own insert form. */
internal data class InsertInput(
    val title: String,
    val beginMs: Long,
    val endMs: Long,
    val location: String?,
    val notes: String?,
    val allDay: Boolean,
)

/** One occurrence of an event, as read from the calendar provider. */
internal data class CalendarInstance(
    val id: String,
    val title: String,
    val begin: Long,
    val end: Long,
    val allDay: Boolean,
    val location: String?,
    val calendarName: String?,
)

/**
 * Calendar access with the smallest permission set that works. Reads go through
 * [CalendarContract.Instances] and need READ_CALENDAR. Nothing here writes to the provider:
 * a new event is handed to the Calendar app's own insert form, where the user saves or cancels
 * it, so the app never holds WRITE_CALENDAR.
 *
 * Times are epoch milliseconds. For an all-day event the provider stores UTC midnights, and
 * [queryInstances] reports them as stored.
 */
class FieldkitCalendarModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    // -------------------------------------------------------------------------
    // React methods
    // -------------------------------------------------------------------------

    @ReactMethod
    fun queryInstances(beginMs: Double, endMs: Double, limit: Double, promise: Promise) {
        if (!beginMs.isFinite() || !endMs.isFinite() || endMs < beginMs) {
            return promise.reject("INVALID_RANGE", "The time range is not valid")
        }
        val context = reactApplicationContext
        if (context.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
            return promise.reject("PERMISSION", "Calendar access has not been granted")
        }
        try {
            val uri = instancesUri(beginMs.toLong(), endMs.toLong())
            val rows = context.contentResolver
                .query(uri, PROJECTION, null, null, "${CalendarContract.Instances.BEGIN} ASC")
                ?.use { readInstances(it, clampLimit(limit.toInt())) }
                .orEmpty()
            val result = Arguments.createArray()
            for (row in rows) {
                result.pushMap(Arguments.createMap().apply {
                    putString("id", row.id)
                    putString("title", row.title)
                    putDouble("begin", row.begin.toDouble())
                    putDouble("end", row.end.toDouble())
                    putBoolean("allDay", row.allDay)
                    putString("location", row.location)
                    putString("calendarName", row.calendarName)
                })
            }
            promise.resolve(result)
        } catch (e: SecurityException) {
            // The user can revoke the permission between the check above and the query.
            promise.reject("PERMISSION", e.message ?: "Calendar access has not been granted", e)
        } catch (e: Exception) {
            promise.reject("QUERY_ERROR", e.message ?: "Could not read the calendar", e)
        }
    }

    @ReactMethod
    fun openInsertForm(event: ReadableMap, promise: Promise) {
        val input = parseInsertInput(event)
            ?: return promise.reject("INVALID_EVENT", "The event needs a title, a start and an end")
        try {
            val intent = buildInsertIntent(input)
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                reactApplicationContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            promise.resolve(true)
        } catch (e: ActivityNotFoundException) {
            promise.reject("NO_CALENDAR_APP", "No calendar app is available on this device", e)
        } catch (e: Exception) {
            // Anything else (for example a SecurityException) must not escape a @ReactMethod.
            promise.reject("OPEN_FAILED", e.message ?: "Could not open the calendar", e)
        }
    }

    companion object {
        const val NAME = "FieldkitCalendar"
        private const val MAX_LIMIT = 50

        internal val PROJECTION = arrayOf(
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
        )

        /** The insert form for [input]: an `ACTION_INSERT` on the events table, so no write permission is needed. */
        internal fun buildInsertIntent(input: InsertInput): Intent =
            Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, input.beginMs)
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, input.endMs)
                .putExtra(CalendarContract.Events.TITLE, input.title)
                .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, input.allDay)
                .apply {
                    input.location?.let { putExtra(CalendarContract.Events.EVENT_LOCATION, it) }
                    input.notes?.let { putExtra(CalendarContract.Events.DESCRIPTION, it) }
                }

        /** At least one row and at most [MAX_LIMIT]. */
        internal fun clampLimit(n: Int): Int = n.coerceIn(1, MAX_LIMIT)

        /** The Instances "when" URI for events overlapping the range. */
        internal fun instancesUri(beginMs: Long, endMs: Long): Uri =
            CalendarContract.Instances.CONTENT_URI.buildUpon().also {
                ContentUris.appendId(it, beginMs)
                ContentUris.appendId(it, endMs)
            }.build()

        /**
         * Up to [limit] rows in cursor order. The id joins the event id and the begin time,
         * because every occurrence of a recurring event shares its event id.
         */
        internal fun readInstances(cursor: Cursor, limit: Int): List<CalendarInstance> {
            val rows = ArrayList<CalendarInstance>()
            while (rows.size < limit && cursor.moveToNext()) {
                val begin = cursor.getLong(2)
                rows.add(
                    CalendarInstance(
                        id = "${cursor.getLong(0)}-$begin",
                        title = cursor.getString(1).orEmpty(),
                        begin = begin,
                        end = cursor.getLong(3),
                        allDay = cursor.getInt(4) != 0,
                        location = cursor.getString(5)?.takeIf { it.isNotBlank() },
                        calendarName = cursor.getString(6)?.takeIf { it.isNotBlank() },
                    )
                )
            }
            return rows
        }

        /** The event from JS, or null when the title is blank or a time is missing or not a finite number. */
        private fun parseInsertInput(event: ReadableMap): InsertInput? {
            val title = readString(event, "title")?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val begin = readNumber(event, "beginMs") ?: return null
            val end = readNumber(event, "endMs") ?: return null
            return InsertInput(
                title = title,
                beginMs = begin.toLong(),
                endMs = end.toLong(),
                location = readString(event, "location")?.takeIf { it.isNotBlank() },
                notes = readString(event, "notes")?.takeIf { it.isNotBlank() },
                allDay = event.hasKey("allDay") && event.getType("allDay") == ReadableType.Boolean &&
                    event.getBoolean("allDay"),
            )
        }

        private fun readString(map: ReadableMap, key: String): String? =
            if (map.hasKey(key) && map.getType(key) == ReadableType.String) map.getString(key) else null

        private fun readNumber(map: ReadableMap, key: String): Double? =
            if (map.hasKey(key) && map.getType(key) == ReadableType.Number) {
                map.getDouble(key).takeIf { it.isFinite() }
            } else {
                null
            }
    }
}
