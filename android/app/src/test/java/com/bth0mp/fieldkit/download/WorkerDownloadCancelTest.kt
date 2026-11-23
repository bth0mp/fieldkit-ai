package com.bth0mp.fieldkit.download

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import androidx.work.impl.utils.taskexecutor.TaskExecutor
import java.io.File
import java.io.InputStream
import androidx.work.impl.utils.taskexecutor.SerialExecutor
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class WorkerDownloadCancelTest {

    // Each test runs in a fresh Robolectric environment: a database kept from the last one has dead connections.
    @Before
    fun freshDatabase() {
        DownloadDatabase::class.java.getDeclaredField("INSTANCE").apply { isAccessible = true }.set(null, null)
    }

    private fun worker(ctx: Context, downloadId: String? = null): WorkerDownload {
        val executor = mock<SerialExecutor>()
        val taskExecutor = mock<TaskExecutor> { on { serialTaskExecutor } doReturn executor }
        val params = mock<WorkerParameters> {
            on { this.taskExecutor } doReturn taskExecutor
            if (downloadId != null) on { inputData } doReturn workDataOf(WorkerDownload.KEY_DOWNLOAD_ID to downloadId)
        }
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

    @Test
    fun `a system stop after the last byte still records the download as completed`() = runBlocking {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val dao = DownloadDatabase.getInstance(ctx).downloadDao()
        val file = File(ctx.cacheDir, "stop-late.gguf").apply { delete() }
        val download = DownloadEntity(
            id = "stopped", url = "https://huggingface.co/m", fileName = "stop-late.gguf", modelId = "m",
            destination = file.absolutePath, totalBytes = 10L, downloadedBytes = 0L,
            status = DownloadStatus.RUNNING, createdAt = 1L,
        )
        dao.insertDownload(download)

        // The whole file arrives, then the work is cancelled (the system stops it) as the stream ends.
        var running: Job? = null
        val input = object : InputStream() {
            private var calls = 0
            override fun read(): Int = -1
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                calls++
                if (calls == 1) return 10.also { java.util.Arrays.fill(b, off, off + it, 1) }
                running?.cancel()
                return -1
            }
        }
        running = launch(Dispatchers.Default) {
            worker(ctx).streamToFile(
                WorkerDownload.StreamParams(input, file, 200, download, "stopped", 0L, 10L, Long.MAX_VALUE),
            )
        }
        running.join()

        assertEquals(DownloadStatus.COMPLETED, dao.getDownload("stopped")!!.status)
        assertTrue(file.exists())
        assertEquals(10L, file.length())
    }

    @Test
    fun `a later run of work whose download is already completed leaves the file and the row alone`() = runBlocking {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val dao = DownloadDatabase.getInstance(ctx).downloadDao()
        val file = File(ctx.cacheDir, "done.gguf").apply { writeBytes(ByteArray(10)) }
        dao.insertDownload(
            DownloadEntity(
                id = "done", url = "https://huggingface.co/m", fileName = "done.gguf", modelId = "m",
                destination = file.absolutePath, totalBytes = 10L, downloadedBytes = 10L,
                status = DownloadStatus.COMPLETED, createdAt = 1L,
            ),
        )

        val result = worker(ctx, "done").doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadStatus.COMPLETED, dao.getDownload("done")!!.status)
        assertTrue(file.exists())
    }

    @Test
    fun `a file that is gone or emptied when the check ends is recorded as failed, not completed`() = runBlocking {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val dao = DownloadDatabase.getInstance(ctx).downloadDao()
        val file = File(ctx.cacheDir, "vanished.gguf").apply { delete() }
        val download = DownloadEntity(
            id = "vanished", url = "https://huggingface.co/m", fileName = "vanished.gguf", modelId = "m",
            destination = file.absolutePath, totalBytes = 10L, downloadedBytes = 0L,
            status = DownloadStatus.RUNNING, createdAt = 1L,
        )
        dao.insertDownload(download)

        // The next run of the same work removes the file's content while this one is still finishing (emptied
        // rather than deleted, because an open file cannot be deleted on the machine the tests run on).
        val input = object : InputStream() {
            private var calls = 0
            override fun read(): Int = -1
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                calls++
                if (calls == 1) return 10.also { java.util.Arrays.fill(b, off, off + it, 1) }
                java.io.RandomAccessFile(file, "rw").use { it.setLength(0L) }
                return -1
            }
        }
        val result = worker(ctx).streamToFile(
            WorkerDownload.StreamParams(input, file, 200, download, "vanished", 0L, 10L, Long.MAX_VALUE),
        )

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadStatus.FAILED, dao.getDownload("vanished")!!.status)
    }
}
