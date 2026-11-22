package ai.offgridmobile.download

import android.app.Application
import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class DownloadDaoTest {
    private lateinit var db: DownloadDatabase
    private lateinit var dao: DownloadDao

    @Before
    fun setUp() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(ctx, DownloadDatabase::class.java).allowMainThreadQueries().build()
        dao = db.downloadDao()
    }

    @After
    fun tearDown() = db.close()

    private fun row(status: DownloadStatus) = DownloadEntity(
        id = "d1", url = "https://huggingface.co/m", fileName = "m.gguf", modelId = "m",
        destination = "/tmp/m.gguf", totalBytes = 100L, downloadedBytes = 0L, status = status, createdAt = 1L,
    )

    @Test
    fun `a progress tick after Cancel does not turn the row back into a running download`() = runBlocking {
        dao.insertDownload(row(DownloadStatus.RUNNING))
        dao.updateStatus("d1", DownloadStatus.CANCELLED, DownloadReason.USER_CANCELLED)

        dao.updateProgress("d1", 50L, 100L, DownloadStatus.RUNNING)

        assertEquals(DownloadStatus.CANCELLED, dao.getDownload("d1")!!.status)
    }

    @Test
    fun `progress still updates a running row, and Retry can requeue a failed one`() = runBlocking {
        dao.insertDownload(row(DownloadStatus.RUNNING))
        dao.updateProgress("d1", 50L, 100L, DownloadStatus.RUNNING)
        assertEquals(50L, dao.getDownload("d1")!!.downloadedBytes)

        dao.updateStatus("d1", DownloadStatus.FAILED, DownloadReason.UNKNOWN_ERROR)
        dao.updateStatus("d1", DownloadStatus.QUEUED)
        dao.updateProgress("d1", 60L, 100L, DownloadStatus.RUNNING)
        assertEquals(DownloadStatus.RUNNING, dao.getDownload("d1")!!.status)
    }

    @Test
    fun `a late running or queued status does not revive a cancelled row`() = runBlocking {
        dao.insertDownload(row(DownloadStatus.RUNNING))
        dao.updateStatus("d1", DownloadStatus.CANCELLED, DownloadReason.USER_CANCELLED)

        dao.updateStatus("d1", DownloadStatus.RUNNING)
        dao.updateStatus("d1", DownloadStatus.QUEUED)

        assertEquals(DownloadStatus.CANCELLED, dao.getDownload("d1")!!.status)
    }
}
