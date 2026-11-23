package com.bth0mp.fieldkit

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.bth0mp.fieldkit.download.DownloadManagerPackage
import com.bth0mp.fieldkit.localdream.LocalDreamPackage
import com.bth0mp.fieldkit.pdf.PDFExtractorPackage
import com.bth0mp.fieldkit.litert.LiteRTPackage
import com.bth0mp.fieldkit.devicememory.DeviceMemoryPackage
import com.bth0mp.fieldkit.speech.FieldkitSpeechPackage
import com.bth0mp.fieldkit.calendar.FieldkitCalendarPackage
import com.bth0mp.fieldkit.kiwix.FieldkitDocumentTreePackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(DownloadManagerPackage())
          add(LocalDreamPackage())
          add(PDFExtractorPackage())
          add(LiteRTPackage())
          add(DeviceMemoryPackage())
          add(FieldkitSpeechPackage())
          add(FieldkitCalendarPackage())
          add(FieldkitDocumentTreePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
