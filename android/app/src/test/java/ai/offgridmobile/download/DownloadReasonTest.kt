package ai.offgridmobile.download

import okhttp3.internal.http2.ErrorCode
import okhttp3.internal.http2.StreamResetException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.EOFException
import java.io.IOException
import java.net.SocketException
import java.net.SocketTimeoutException

class DownloadReasonTest {
    @Test
    fun `a CDN stream reset mid-transfer is an interrupted transfer, which is retried`() {
        // Was UNKNOWN_ERROR, which is never retried: one reset failed the whole download.
        val code = DownloadReason.fromThrowable(StreamResetException(ErrorCode.INTERNAL_ERROR))
        assertEquals(DownloadReason.DOWNLOAD_INTERRUPTED, code)
        assertTrue(DownloadReason.isRetryable(code))
    }

    @Test
    fun `an unexpected end of stream is an interrupted transfer`() {
        assertEquals(DownloadReason.DOWNLOAD_INTERRUPTED, DownloadReason.fromThrowable(EOFException("unexpected end of stream")))
        assertEquals(DownloadReason.DOWNLOAD_INTERRUPTED, DownloadReason.fromThrowable(IOException("closed")))
    }

    @Test
    fun `network and timeout failures keep their own codes, and a non-IO failure stays unknown`() {
        assertEquals(DownloadReason.NETWORK_LOST, DownloadReason.fromThrowable(SocketException("reset")))
        assertEquals(DownloadReason.NETWORK_TIMEOUT, DownloadReason.fromThrowable(SocketTimeoutException()))
        val unknown = DownloadReason.fromThrowable(IllegalStateException("bug"))
        assertEquals(DownloadReason.UNKNOWN_ERROR, unknown)
        assertFalse(DownloadReason.isRetryable(unknown))
    }

    @Test
    fun `a transfer that wrote bytes resumes in place, one that wrote nothing does not`() {
        assertTrue(DownloadReason.resumesInPlace(DownloadReason.DOWNLOAD_INTERRUPTED, madeProgress = true))
        assertFalse(DownloadReason.resumesInPlace(DownloadReason.DOWNLOAD_INTERRUPTED, madeProgress = false))
        // A failure that a retry cannot fix never loops, even after progress.
        assertFalse(DownloadReason.resumesInPlace(DownloadReason.DISK_FULL, madeProgress = true))
        assertFalse(DownloadReason.resumesInPlace(DownloadReason.UNKNOWN_ERROR, madeProgress = true))
    }

    @Test
    fun `a full disk while writing is disk_full, not a network cut, and is never resumed in place`() {
        val full = DiskWriteException(IOException("write failed: ENOSPC (No space left on device)"))
        assertEquals(DownloadReason.DISK_FULL, DownloadReason.fromThrowable(full))
        assertFalse(DownloadReason.resumesInPlace(DownloadReason.fromThrowable(full), madeProgress = true))
        assertEquals(DownloadReason.UNKNOWN_ERROR, DownloadReason.fromThrowable(DiskWriteException(IOException("EIO"))))
    }

    @Test
    fun `a connection that keeps dropping stops resuming in place after the cap`() {
        val code = DownloadReason.DOWNLOAD_INTERRUPTED
        assertTrue(DownloadReason.resumesInPlace(code, madeProgress = true, resumesSoFar = DownloadReason.MAX_IN_PLACE_RESUMES - 1))
        assertFalse(DownloadReason.resumesInPlace(code, madeProgress = true, resumesSoFar = DownloadReason.MAX_IN_PLACE_RESUMES))
    }

    @Test
    fun `a resume that gets the whole file back instead of a range restarts from zero`() {
        // Appending a full 200 body to the kept partial file would mix two transfers.
        assertTrue(WorkerDownload.restartsFromZero(code = 200, requestStartBytes = 4096L))
        assertFalse(WorkerDownload.restartsFromZero(code = 206, requestStartBytes = 4096L))
        // A first request has nothing to throw away.
        assertFalse(WorkerDownload.restartsFromZero(code = 200, requestStartBytes = 0L))
    }

    @Test
    fun `a 206 is only appended when the local file is exactly where the request asked to resume`() {
        assertTrue(WorkerDownload.partialFileMatchesRequest(code = 206, requestStartBytes = 4096L, localLength = 4096L, contentRange = null))
        // The file was deleted (a cancel) or cut back: its bytes no longer line up with the offset.
        assertFalse(WorkerDownload.partialFileMatchesRequest(code = 206, requestStartBytes = 4096L, localLength = 0L, contentRange = null))
        assertFalse(WorkerDownload.partialFileMatchesRequest(code = 206, requestStartBytes = 4096L, localLength = 1000L, contentRange = null))
        // The file grew or was replaced by a longer one.
        assertFalse(WorkerDownload.partialFileMatchesRequest(code = 206, requestStartBytes = 4096L, localLength = 8192L, contentRange = null))
        // Only a 206 is an append.
        assertTrue(WorkerDownload.partialFileMatchesRequest(code = 200, requestStartBytes = 4096L, localLength = 0L, contentRange = null))
    }

    @Test
    fun `a 206 whose Content-Range starts anywhere else than the requested offset is not appended`() {
        fun ok(range: String?) = WorkerDownload.partialFileMatchesRequest(206, 4096L, 4096L, range)
        assertTrue(ok("bytes 4096-9999/10000"))
        assertFalse(ok("bytes 0-9999/10000"))
        assertFalse(ok("bytes 4097-9999/10000"))
        assertFalse(ok("bytes */10000"))
        assertFalse(ok("garbage"))
        assertTrue(ok(null))
    }
}
