#include "workspace.hpp"
#include <algorithm>
#include <chrono>
#include <fstream>
#include <set>
#include <sstream>
#include <sys/stat.h>

namespace codaloud {
Json syncManifest(const fs::path &root, const Json &args) {
  const auto started = std::chrono::steady_clock::now();
  const auto rules = args.value("allowedPaths", std::vector<std::string>{});
  if (rules.size() > 30)
    throw WorkspaceError("INVALID_PATH", "Too many selected sync paths.");
  for (const auto &rule : rules) {
    if (rule.size() > 128 || rule.find('\0') != std::string::npos ||
        rule.find('\\') != std::string::npos)
      throw WorkspaceError("INVALID_PATH", "Invalid selected sync path.");
    checkedPath(root, rule);
    const auto star = rule.find('*');
    if (star != std::string::npos &&
        (star != rule.size() - 1 || star < 2 ||
         rule.find('/') != std::string::npos ||
         rule.find('*', star + 1) != std::string::npos))
      throw WorkspaceError("INVALID_PATH", "Invalid selected sync path.");
    std::string lower = rule;
    std::transform(lower.begin(), lower.end(), lower.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    if (star != std::string::npos &&
        std::string(".git").rfind(lower.substr(0, star), 0) == 0)
      throw WorkspaceError("INVALID_PATH",
                           "Git metadata cannot be synced as files.");
  }
  const auto selected = [&rules](const std::string &path, bool directory) {
    for (const auto &rule : rules) {
      if (rule.find('/') != std::string::npos) {
        if (path == rule || path.rfind(rule + "/", 0) == 0 ||
            (directory && rule.rfind(path + "/", 0) == 0))
          return true;
      } else {
        std::istringstream parts(path);
        std::string part;
        while (std::getline(parts, part, '/'))
          if (rule.back() == '*'
                  ? part.rfind(rule.substr(0, rule.size() - 1), 0) == 0
                  : part == rule)
            return true;
      }
    }
    return false;
  };
  const std::set<std::string> excluded = {".expo", ".next", "node_modules",
                                          "dist",  "build", "coverage",
                                          ".venv", "venv",  "__pycache__"};
  const auto fingerprint = [](const fs::path &path) {
    struct stat value{};
    if (lstat(path.c_str(), &value) != 0 || !S_ISREG(value.st_mode))
      throw WorkspaceError(
          "FILE_CHANGED",
          "A device file changed while checking the workspace.");
    std::ostringstream key;
    key << value.st_size << ':' << value.st_ino << ':' << value.st_dev << ':'
        << value.st_mode << ':';
#ifdef __APPLE__
    key << value.st_mtimespec.tv_sec << ':' << value.st_mtimespec.tv_nsec << ':'
        << value.st_ctimespec.tv_sec << ':' << value.st_ctimespec.tv_nsec;
#else
    key << value.st_mtim.tv_sec << ':' << value.st_mtim.tv_nsec << ':'
        << value.st_ctim.tv_sec << ':' << value.st_ctim.tv_nsec;
#endif
    return key.str();
  };
  const auto cachePath = root.parent_path() /
                         ("." + root.filename().string() + ".sync-cache.json");
  Json previous = Json::object(), manifest = Json::object();
  bool cacheChanged = false;
  try {
    if (fs::is_regular_file(fs::symlink_status(cachePath)) &&
        fs::file_size(cachePath) <= 32 * 1024 * 1024) {
      std::ifstream input(cachePath);
      auto saved = Json::parse(input);
      if (saved.value("version", 0) == 1 && saved.at("entries").is_object())
        previous = std::move(saved.at("entries"));
    }
  } catch (...) { /* Invalid hints require a fresh hash. */
  }
  size_t visited = 0, hashed = 0, reused = 0;
  uint64_t bytesHashed = 0, manifestBytes = 0;
  for (auto iterator = fs::recursive_directory_iterator(root);
       iterator != fs::recursive_directory_iterator(); ++iterator) {
    if (++visited > 200000 ||
        std::chrono::steady_clock::now() - started > std::chrono::seconds(120))
      throw WorkspaceError("WORKSPACE_TOO_LARGE",
                           "This workspace exceeds the device scan limit.");
    const auto path = iterator->path();
    const auto name = path.filename().string();
    const auto relative = path.lexically_relative(root).generic_string();
    auto lower = name;
    std::transform(lower.begin(), lower.end(), lower.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    const auto status = iterator->symlink_status();
    if (lower == ".git" || fs::is_symlink(status)) {
      iterator.disable_recursion_pending();
      continue;
    }
    const bool directory = fs::is_directory(status),
               allowed = selected(relative, directory);
    bool dependency = false;
    for (const auto &part : fs::path(relative))
      if (excluded.count(part.string()))
        dependency = true;
    if (dependency && !allowed) {
      iterator.disable_recursion_pending();
      continue;
    }
    if (directory || !fs::is_regular_file(status))
      continue;
    manifestBytes += relative.size() + 80;
    if (relative.find('\\') != std::string::npos || relative.size() > 4096 ||
        manifest.size() >= 100000 || manifestBytes > 16 * 1024 * 1024)
      throw WorkspaceError("WORKSPACE_TOO_LARGE",
                           "This workspace exceeds the file sync limit.");
    const auto size = fs::file_size(path);
    if (size > 32 * 1024 * 1024 && !selected(relative, false))
      continue;
    if (size > 128 * 1024 * 1024)
      throw WorkspaceError("FILE_TOO_LARGE",
                           "A selected file exceeds the 128 MiB sync limit.");
    const auto key = fingerprint(path);
    std::string hash;
    if (previous.contains(relative)) {
      const auto &old = previous.at(relative);
      if (old.is_object() && old.contains("key") && old.at("key").is_string() &&
          old.at("key") == key && old.contains("hash") &&
          old.at("hash").is_string()) {
        hash = old.at("hash").get<std::string>();
        if (hash.size() != 64 ||
            !std::all_of(hash.begin(), hash.end(), [](unsigned char c) {
              return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
            }))
          hash.clear();
      }
    }
    if (hash.empty()) {
      hash = sha256File(path);
      if (fingerprint(path) != key)
        throw WorkspaceError(
            "FILE_CHANGED",
            "A device file changed while hashing. Try syncing again.");
      ++hashed;
      bytesHashed += size;
      previous[relative] = {{"key", key}, {"hash", hash}};
      cacheChanged = true;
    } else
      ++reused;
    manifest[relative] = hash;
  }
  for (auto entry = previous.begin(); entry != previous.end();) {
    if (!manifest.contains(entry.key())) {
      entry = previous.erase(entry);
      cacheChanged = true;
    } else
      ++entry;
  }
  try {
    if (cacheChanged && !fs::is_symlink(fs::symlink_status(cachePath))) {
      Json saved = {{"version", 1}};
      saved["entries"] = std::move(previous);
      const auto content = saved.dump();
      if (content.size() <= 32 * 1024 * 1024)
        atomicSave(cachePath, content);
    }
  } catch (...) { /* Cache persistence is optional. */
  }
  Json result = {
      {"metrics",
       {{"hashed", hashed},
        {"reused", reused},
        {"bytesHashed", bytesHashed},
        {"durationMs", std::chrono::duration_cast<std::chrono::milliseconds>(
                           std::chrono::steady_clock::now() - started)
                           .count()}}}};
  result["manifest"] = std::move(manifest);
  return result;
}
} // namespace codaloud
