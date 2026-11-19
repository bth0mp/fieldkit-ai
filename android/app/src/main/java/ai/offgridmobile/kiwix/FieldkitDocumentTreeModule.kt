package ai.offgridmobile.kiwix

import ai.offgridmobile.SafePromise
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * Lists the files in a folder the user granted through the folder picker (a Storage Access Framework tree uri):
 * the folder's own files and those of its direct sub-folders. Each entry is a document uri the app can read with
 * react-native-fs, plus its name and size. Kiwix keeps its downloads in Android/media/org.kiwix.kiwixmobile.
 */
class FieldkitDocumentTreeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    @ReactMethod
    fun listFiles(treeUri: String, promise: Promise) {
        val safe = SafePromise(promise, NAME)
        Thread {
            try {
                val tree = Uri.parse(treeUri)
                val out = Arguments.createArray()
                val folders = listChildren(tree, DocumentsContract.getTreeDocumentId(tree), out)
                for (folder in folders) listChildren(tree, folder, out)
                safe.resolve(out)
            } catch (e: Exception) {
                // A revoked grant (SecurityException) or a folder that is gone.
                safe.reject("UNREADABLE", e.message ?: "The folder can't be read", e)
            }
        }.start()
    }

    /** Adds the files under [parentId] to [out] and returns the ids of its sub-folders. */
    private fun listChildren(tree: Uri, parentId: String, out: WritableArray): List<String> {
        val folders = mutableListOf<String>()
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId)
        val columns = arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_SIZE, Document.COLUMN_MIME_TYPE)
        reactApplicationContext.contentResolver.query(children, columns, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getString(0) ?: continue
                if (cursor.getString(3) == Document.MIME_TYPE_DIR) {
                    folders.add(id)
                    continue
                }
                out.pushMap(Arguments.createMap().apply {
                    putString("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString())
                    putString("name", cursor.getString(1) ?: id.substringAfterLast('/'))
                    putDouble("size", if (cursor.isNull(2)) 0.0 else cursor.getLong(2).toDouble())
                })
            }
        }
        return folders
    }

    companion object {
        const val NAME = "FieldkitDocumentTree"
    }
}
