package ai.offgridmobile.download

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import androidx.work.impl.utils.taskexecutor.TaskExecutor
import java.io.File
import java.io.InputStream
import androidx.work.impl.utils.taskexecutor.SerialExecutor
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class WorkerDownloadCancelTest {

    private fun worker(ctx: Context): WorkerDownload {
        val executor = mock<SerialExecutor>()
        val taskExecutor = mock<TaskExecutor> { on { serialTaskExecutor } doReturn executor }
        val params = mock<WorkerParameters> { on { this.taskExecutor } doReturn taskExecutor }
        return WorkerDownload(ctx, params)
    }

    @Test
    fun `a download cancelled while its last bytes arrive stays cancelled and loses its partial file`() = runBlocking {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val dao = DownloadDatabase.getInstance(ctx).downloadDao()
        val file = File(ctx.cacheDir, "cancel-late.gguf").apply { delete() }
        val download = DownloadEntity(
            id = "late", url = "https://huggingface.co/m", fileName = "cancel-late.gguf", modelId = "m",
            destination = file.absolutePath, totalBytes = 1000L, downloadedBytes = 0L,
            status = DownloadStatus.RUNNING, createdAt = 1L,
        )
        dao.insertDownload(download)

        // The stream ends short of the expected size (which would fail the row as corrupted), and the
        // user cancels during the final read.
        val input = object : InputStream() {
            private var calls = 0
            override fun read(): Int = -1
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                calls++
                if (calls == 1) return 10.also { java.util.Arrays.fill(b, off, off + it, 1) }
                runBlocking { dao.updateStatus("late", DownloadStatus.CANCELLED, DownloadReason.USER_CANCELLED) }
                return -1
            }
        }

        val result = worker(ctx).streamToFile(
            WorkerDownload.StreamParams(input, file, 200, download, "late", 0L, 1000L, Long.MAX_VALUE),
        )

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadStatus.CANCELLED, dao.getDownload("late")!!.status)
        assertFalse(file.exists())
    }
}
