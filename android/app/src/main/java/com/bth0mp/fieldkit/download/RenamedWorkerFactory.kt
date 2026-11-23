package com.bth0mp.fieldkit.download

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters

/**
 * WorkManager stores the class name of every queued job. A download queued by a version that kept
 * this worker in another package still names that class, so after an update the job would fail to
 * start and the download would be lost. This factory runs those jobs as [WorkerDownload].
 */
class RenamedWorkerFactory : WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters,
    ): ListenableWorker? =
        if (workerClassName == PREVIOUS_CLASS_NAME) WorkerDownload(appContext, workerParameters) else null

    companion object {
        const val PREVIOUS_CLASS_NAME = "ai.offgridmobile.download.WorkerDownload"
    }
}
