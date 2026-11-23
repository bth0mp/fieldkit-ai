package com.bth0mp.fieldkit.download

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkerParameters
import com.bth0mp.fieldkit.MainApplication
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.mock
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class WorkManagerStartupTest {
    private val ctx = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun `the default WorkManager initializer is not declared, so the app configuration is used`() {
        val provider = ctx.packageManager.getProviderInfo(
            ComponentName(ctx.packageName, "androidx.startup.InitializationProvider"),
            PackageManager.GET_META_DATA,
        )
        val declared = provider.metaData?.keySet().orEmpty()
        assertFalse(declared.contains("androidx.work.WorkManagerInitializer"))
        assertTrue(declared.isNotEmpty())
    }

    @Test
    fun `the application's WorkManager configuration runs an old-class job as the download worker`() {
        val factory = MainApplication().workManagerConfiguration.workerFactory
        val worker = factory.createWorkerWithDefaultFallback(
            ctx, RenamedWorkerFactory.PREVIOUS_CLASS_NAME, mock<WorkerParameters>(),
        )
        assertTrue(worker is WorkerDownload)
    }
}
