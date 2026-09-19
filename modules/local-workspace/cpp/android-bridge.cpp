#include "git.hpp"
#include <jni.h>
#include <mutex>

// JNI uses UTF-16; NewStringUTF/GetStringUTFChars use modified UTF-8 and would
// corrupt emoji and null bytes in editor content. Exchange byte arrays instead.
static std::string bytes(JNIEnv *env, jbyteArray input) {
  const auto length = env->GetArrayLength(input);
  std::string result(static_cast<size_t>(length), '\0');
  env->GetByteArrayRegion(input, 0, length,
                          reinterpret_cast<jbyte *>(result.data()));
  return result;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_expo_modules_localworkspace_LocalWorkspaceModule_executeNative(
    JNIEnv *env, jobject, jbyteArray root, jbyteArray request,
    jbyteArray certificates) {
  static std::once_flag initialized;
  static const int libraryStatus = git_libgit2_init();
  static int initializationStatus = 0;
  const auto trustPath = bytes(env, certificates);
  if (!trustPath.empty())
    std::call_once(initialized, [&] {
      initializationStatus = git_libgit2_opts(GIT_OPT_SET_SSL_CERT_LOCATIONS,
                                              trustPath.c_str(), nullptr);
    });
  const auto result =
      libraryStatus < 0 || (!trustPath.empty() && initializationStatus < 0)
          ? codaloud::Json(
                {{"ok", false},
                 {"code", "TLS_INITIALIZATION_FAILED"},
                 {"message",
                  "Unable to load Android's certificate trust store."}})
                .dump()
          : codaloud::execute(bytes(env, root), bytes(env, request));
  const auto output = env->NewByteArray(static_cast<jsize>(result.size()));
  if (output)
    env->SetByteArrayRegion(output, 0, static_cast<jsize>(result.size()),
                            reinterpret_cast<const jbyte *>(result.data()));
  return output;
}
