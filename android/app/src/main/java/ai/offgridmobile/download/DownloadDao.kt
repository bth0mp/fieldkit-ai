package ai.offgridmobile.download

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :downloadId")
    suspend fun getDownload(downloadId: String): DownloadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDownload(download: DownloadEntity)

    @Delete
    suspend fun deleteDownload(download: DownloadEntity)

    // A cancelled row stays cancelled: a late progress tick from a worker that has not stopped yet
    // must not turn it back into a running download.
    @Query("UPDATE downloads SET downloadedBytes = :bytes, totalBytes = :totalBytes, status = :status WHERE id = :downloadId AND status != 'CANCELLED'")
    suspend fun updateProgress(downloadId: String, bytes: Long, totalBytes: Long, status: DownloadStatus)

    @Query("UPDATE downloads SET status = :status, error = :error WHERE id = :downloadId")
    suspend fun updateStatus(downloadId: String, status: DownloadStatus, error: String? = null)
}
