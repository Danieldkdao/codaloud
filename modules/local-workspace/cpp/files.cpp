#include "workspace.hpp"
#include <algorithm>
#include <cerrno>
#include <fcntl.h>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <unistd.h>
#ifdef __APPLE__
#include <CommonCrypto/CommonDigest.h>
#else
#include <mbedtls/sha256.h>
#endif

namespace codaloud {
static constexpr size_t editorLimit = 1024 * 1024;

std::string sha256(const std::string &value) {
  unsigned char digest[32];
#ifdef __APPLE__
  CC_SHA256(value.data(), static_cast<CC_LONG>(value.size()), digest);
#else
  mbedtls_sha256(reinterpret_cast<const unsigned char *>(value.data()),
                 value.size(), digest, 0);
#endif
  std::ostringstream result;
  for (auto byte : digest)
    result << std::hex << std::setfill('0') << std::setw(2)
           << static_cast<unsigned int>(byte);
  return result.str();
}

std::string sha256File(const fs::path &path) {
  const int descriptor = open(path.c_str(), O_RDONLY | O_NOFOLLOW);
  if (descriptor < 0)
    throw WorkspaceError("FILE_UNAVAILABLE",
                         "Unable to verify a changed file.");
#ifdef __APPLE__
  CC_SHA256_CTX context;
  CC_SHA256_Init(&context);
#else
  mbedtls_sha256_context context;
  mbedtls_sha256_init(&context);
  mbedtls_sha256_starts(&context, 0);
#endif
  unsigned char buffer[8192], digest[32];
  ssize_t count;
  while ((count = read(descriptor, buffer, sizeof(buffer))) > 0) {
#ifdef __APPLE__
    CC_SHA256_Update(&context, buffer, static_cast<CC_LONG>(count));
#else
    mbedtls_sha256_update(&context, buffer, count);
#endif
  }
  close(descriptor);
#ifdef __APPLE__
  CC_SHA256_Final(digest, &context);
#else
  mbedtls_sha256_finish(&context, digest);
  mbedtls_sha256_free(&context);
#endif
  if (count < 0)
    throw WorkspaceError("FILE_UNAVAILABLE",
                         "Unable to verify a changed file.");
  std::ostringstream result;
  for (auto byte : digest)
    result << std::hex << std::setfill('0') << std::setw(2)
           << static_cast<unsigned int>(byte);
  return result.str();
}

std::string readText(const fs::path &path) {
  if (!fs::is_regular_file(fs::symlink_status(path)))
    throw WorkspaceError("UNSUPPORTED_FILE", "Choose a regular text file.");
  if (fs::file_size(path) > editorLimit)
    throw WorkspaceError("FILE_TOO_LARGE",
                         "This file exceeds the editor size limit.");
  const int descriptor = open(path.c_str(), O_RDONLY | O_NOFOLLOW);
  if (descriptor < 0)
    throw WorkspaceError("FILE_UNAVAILABLE", "Unable to read this file.");
  std::string content;
  char buffer[8192];
  ssize_t count;
  while ((count = read(descriptor, buffer, sizeof(buffer))) > 0) {
    content.append(buffer, static_cast<size_t>(count));
    if (content.size() > editorLimit) {
      close(descriptor);
      throw WorkspaceError("FILE_TOO_LARGE",
                           "This file exceeds the editor size limit.");
    }
  }
  close(descriptor);
  if (count < 0)
    throw WorkspaceError("FILE_UNAVAILABLE", "Unable to read this file.");
  if (content.find('\0') != std::string::npos)
    throw WorkspaceError("BINARY_FILE", "This file is not UTF-8 text.");
  try {
    Json(content).dump();
  } catch (...) {
    throw WorkspaceError("BINARY_FILE", "This file is not UTF-8 text.");
  }
  return content;
}

static Json entry(const fs::path &root, const fs::path &path) {
  const bool directory = fs::is_directory(path);
  return {{"name", path.filename().string()},
          {"path", path.lexically_relative(root).generic_string()},
          {"isDir", directory},
          {"size", directory ? 0 : fs::file_size(path)}};
}

static std::string filename(const Json &args, const std::string &key) {
  const auto name = args.at(key).get<std::string>();
  if (name.empty() || name.size() > 255 ||
      name.find_first_of("/\\") != std::string::npos ||
      std::any_of(name.begin(), name.end(),
                  [](unsigned char c) { return c < 32 || c == 127; }))
    throw WorkspaceError("INVALID_PATH", "Use a single file or folder name.");
  return name;
}

static void atomicSave(const fs::path &path, const std::string &content) {
  auto pattern = (path.parent_path() / ".codaloud-save-XXXXXX").string();
  std::vector<char> name(pattern.begin(), pattern.end());
  name.push_back('\0');
  const int descriptor = mkstemp(name.data());
  if (descriptor < 0)
    throw WorkspaceError("FILE_WRITE_FAILED",
                         "Unable to create a temporary save file.");
  bool openDescriptor = true;
  try {
    fs::permissions(name.data(), fs::status(path).permissions());
    size_t offset = 0;
    while (offset < content.size()) {
      const auto count =
          write(descriptor, content.data() + offset, content.size() - offset);
      if (count < 0 && errno == EINTR)
        continue;
      if (count <= 0)
        throw WorkspaceError(
            "FILE_WRITE_FAILED",
            "Unable to write this file. Check available device storage.");
      offset += static_cast<size_t>(count);
    }
    if (fsync(descriptor) != 0)
      throw WorkspaceError("FILE_WRITE_FAILED", "Unable to persist this file.");
    close(descriptor);
    openDescriptor = false;
    fs::rename(name.data(), path);
    const int directory =
        open(path.parent_path().c_str(), O_RDONLY | O_DIRECTORY);
    if (directory >= 0) {
      fsync(directory);
      close(directory);
    }
  } catch (...) {
    if (openDescriptor)
      close(descriptor);
    fs::remove(name.data());
    throw;
  }
}

Json fileOperation(const fs::path &root, const std::string &operation,
                   const Json &args) {
  if (operation == "list-files") {
    const auto path = checkedPath(root, args.value("path", ""), true);
    Json files = Json::array();
    for (const auto &item : fs::directory_iterator(path)) {
      if (item.path().filename() == ".git" || item.is_symlink() ||
          (!item.is_regular_file() && !item.is_directory()))
        continue;
      files.push_back(entry(root, item.path()));
      if (files.size() > 50000)
        throw WorkspaceError("DIRECTORY_TOO_LARGE",
                             "This folder contains too many entries.");
    }
    std::sort(files.begin(), files.end(), [](const Json &a, const Json &b) {
      if (a.at("isDir") != b.at("isDir"))
        return a.at("isDir").get<bool>();
      return a.at("name").get<std::string>() < b.at("name").get<std::string>();
    });
    return files;
  }
  if (operation == "read-file" || operation == "save-file") {
    const auto relative = args.at("path").get<std::string>();
    const auto path = checkedPath(root, relative);
    const auto content = readText(path);
    if (operation == "read-file")
      return {
          {"path", relative}, {"content", content}, {"size", content.size()}};
    if (sha256(content) != args.at("expectedContentHash").get<std::string>())
      throw WorkspaceError(
          "FILE_CHANGED",
          "This file changed since it was opened. Reload it before saving.");
    const auto next = args.at("content").get<std::string>();
    if (next.size() > editorLimit || next.find('\0') != std::string::npos)
      throw WorkspaceError("INVALID_CONTENT",
                           "Use UTF-8 text within the editor size limit.");
    atomicSave(path, next);
    return {{"path", relative},
            {"size", next.size()},
            {"contentHash", sha256(next)}};
  }
  if (operation == "create-file" || operation == "rename-file" ||
      operation == "delete-file") {
    const auto parent = checkedPath(root, args.value("parentPath", ""), true);
    const auto path = checkedPath(
        root, (parent.lexically_relative(root) / filename(args, "name"))
                  .lexically_normal()
                  .generic_string());
    const auto kind = args.at("kind").get<std::string>();
    if (kind != "file" && kind != "folder")
      throw WorkspaceError("INVALID_INPUT", "Choose a file or folder.");
    if (operation == "create-file") {
      if (fs::exists(path))
        throw WorkspaceError("FILE_EXISTS",
                             "A file or folder already uses this name.");
      if (kind == "folder")
        fs::create_directory(path);
      else {
        const int descriptor =
            open(path.c_str(), O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, 0600);
        if (descriptor < 0)
          throw WorkspaceError("FILE_WRITE_FAILED",
                               "Unable to create this file.");
        close(descriptor);
      }
      return entry(root, path);
    }
    const auto original =
        operation == "rename-file"
            ? checkedPath(root, (parent.lexically_relative(root) /
                                 filename(args, "previousName"))
                                    .lexically_normal()
                                    .generic_string())
            : path;
    if (!fs::exists(original) ||
        fs::is_directory(original) != (kind == "folder"))
      throw WorkspaceError(
          "FILE_NOT_FOUND",
          "The selected file or folder changed. Refresh and try again.");
    const auto previous = entry(root, original);
    if (operation == "delete-file") {
      fs::remove_all(original);
      return previous;
    }
    if (fs::exists(path))
      throw WorkspaceError("FILE_EXISTS",
                           "A file or folder already uses this name.");
    fs::rename(original, path);
    return entry(root, path);
  }
  throw WorkspaceError("UNKNOWN_OPERATION",
                       "Unknown local workspace operation.");
}
} // namespace codaloud
