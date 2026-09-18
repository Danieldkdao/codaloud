#include "workspace.hpp"
#include <git2.h>
#include <algorithm>
#include <iomanip>
#include <mutex>
#include <regex>
#include <sstream>

namespace codaloud {
std::string timestamp(std::time_t time) {
  std::tm utc{};
  gmtime_r(&time, &utc);
  std::ostringstream output;
  output << std::put_time(&utc, "%Y-%m-%dT%H:%M:%S.000Z");
  return output.str();
}

fs::path checkedPath(const fs::path &root, const std::string &relative, bool allowRoot) {
  if (relative.empty() && allowRoot) return root;
  if (relative.empty() || relative.size() > 4096 || relative.front() == '/' || relative.back() == '/' || relative.find('\0') != std::string::npos)
    throw WorkspaceError("INVALID_PATH", "Choose a relative path inside this project.");
  fs::path result = root;
  std::istringstream parts(relative);
  std::string part;
  while (std::getline(parts, part, '/')) {
    std::string lower = part;
    std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) { return std::tolower(c); });
    if (part.empty() || part == "." || part == ".." || lower == ".git")
      throw WorkspaceError("INVALID_PATH", "This path is reserved or outside the project.");
    result /= part;
    if (fs::is_symlink(fs::symlink_status(result)))
      throw WorkspaceError("UNSUPPORTED_FILE", "Symbolic links cannot be opened or edited.");
  }
  return result;
}

std::string execute(const std::string &base, const std::string &request) {
  // All worktree and Git mutations use this same lock. Native AsyncFunctions run
  // off the UI thread, so a save cannot race a checkout or another file operation.
  static std::mutex workspaceMutex;
  std::lock_guard<std::mutex> lock(workspaceMutex);
  try {
    const auto input = Json::parse(request);
    const auto id = input.at("projectId").get<std::string>();
    if (!std::regex_match(id, std::regex("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")))
      throw WorkspaceError("INVALID_PROJECT", "Invalid local project ID.");
    const auto operation = input.at("operation").get<std::string>();
    const auto args = input.value("args", Json::object());
    const fs::path root = fs::path(base) / id;
    fs::create_directories(base);
    if (fs::is_symlink(fs::symlink_status(root))) throw WorkspaceError("INVALID_PROJECT", "Invalid local project folder.");
    Json data;
    if (operation == "initialize") {
      if (fs::exists(root)) throw WorkspaceError("PROJECT_EXISTS", "This project already exists on the device.");
      fs::create_directory(root);
      data = true;
    } else {
      if (!fs::is_directory(root)) throw WorkspaceError("PROJECT_NOT_FOUND", "This project is not available on the device.");
      data = fileOperation(root, operation, args);
    }
    return Json({{"ok", true}, {"data", data}}).dump();
  } catch (const WorkspaceError &error) {
    return Json({{"ok", false}, {"code", error.code}, {"message", error.what()}}).dump();
  } catch (const std::exception &) {
    return Json({{"ok", false}, {"code", "LOCAL_WORKSPACE_ERROR"}, {"message", "Unable to complete the operation on this device."}}).dump();
  }
}
}
