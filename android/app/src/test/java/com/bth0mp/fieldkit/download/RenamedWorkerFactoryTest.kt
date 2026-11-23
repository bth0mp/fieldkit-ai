package com.bth0mp.fieldkit.download

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkerParameters
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.mock
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class RenamedWorkerFactoryTest {
    private val ctx = ApplicationProvider.getApplicationContext<Context>()
    private val params = mock<WorkerParameters>()

    @Test
    fun `a job queued under the previous class name runs as the download worker`() {
        val worker = RenamedWorkerFactory().createWorker(ctx, RenamedWorkerFactory.PREVIOUS_CLASS_NAME, params)
        assertTrue(worker is WorkerDownload)
    }

    @Test
    fun `any other class name is left to WorkManager`() {
        assertNull(RenamedWorkerFactory().createWorker(ctx, WorkerDownload::class.java.name, params))
    }
}
