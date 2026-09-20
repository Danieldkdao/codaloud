package expo.modules.localworkspace

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.KeyStore
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import org.json.JSONObject

class LocalWorkspaceModule : Module() {
  companion object {
    init { System.loadLibrary("codaloud-workspace") }
  }

  private external fun executeNative(root: ByteArray, request: ByteArray, certificates: ByteArray): ByteArray

  private val trustStore by lazy {
    val context = requireNotNull(appContext.reactContext)
    val manager = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    manager.init(null as KeyStore?)
    val certificates = manager.trustManagers.filterIsInstance<X509TrustManager>()
      .flatMap { it.acceptedIssuers.toList() }
    check(certificates.isNotEmpty()) { "Android's certificate trust store is unavailable." }
    val destination = File(context.cacheDir, "codaloud-system-trust.pem")
    destination.writeText(certificates.joinToString("\n") {
      "-----BEGIN CERTIFICATE-----\n" + Base64.encodeToString(it.encoded, Base64.NO_WRAP)
        .chunked(64).joinToString("\n") + "\n-----END CERTIFICATE-----\n"
    })
    destination.absolutePath
  }

  override fun definition() = ModuleDefinition {
    Name("LocalWorkspace")

    AsyncFunction("execute") { request: String ->
      val context = requireNotNull(appContext.reactContext)
      val root = File(context.filesDir, "codaloud-workspaces")
      check(root.isDirectory || root.mkdirs()) { "Unable to open the local workspace folder." }
      val operation = JSONObject(request).getString("operation")
      val needsNetwork = operation in listOf("clone", "git/fetch", "git/push", "git/pull")
      val certificates = if (needsNetwork) trustStore else ""
      executeNative(root.absolutePath.toByteArray(Charsets.UTF_8), request.toByteArray(Charsets.UTF_8),
        certificates.toByteArray(Charsets.UTF_8)).toString(Charsets.UTF_8)
    }
  }
}
