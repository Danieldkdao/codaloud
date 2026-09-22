#include "workspace.hpp"
#include "git.hpp"
#include <algorithm>
#include <iomanip>
#include <map>
#include <memory>
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

fs::path checkedPath(const fs::path &root, const std::string &relative,
                     bool allowRoot, bool allowLeafSymlink) {
  if (relative.empty() && allowRoot)
    return root;
  if (relative.empty() || relative.size() > 4096 || relative.front() == '/' ||
      relative.back() == '/' || relative.find('\0') != std::string::npos)
    throw WorkspaceError("INVALID_PATH",
                         "Choose a relative path inside this project.");
  fs::path result = root;
  std::istringstream parts(relative);
  std::string part;
  while (std::getline(parts, part, '/')) {
    std::string lower = part;
    std::transform(lower.begin(), lower.end(), lower.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    if (part.empty() || part == "." || part == ".." || lower == ".git")
      throw WorkspaceError("INVALID_PATH",
                           "This path is reserved or outside the project.");
    result /= part;
    if (fs::is_symlink(fs::symlink_status(result)) &&
        !(allowLeafSymlink && parts.eof()))
      throw WorkspaceError("UNSUPPORTED_FILE",
                           "Symbolic links cannot be opened or edited.");
  }
  return result;
}

std::string execute(const std::string &base, const std::string &request) {
  static std::mutex registryMutex;
  static std::map<std::string, std::weak_ptr<std::mutex>> locks;
  static const int initialized = [] {
    const int result = git_libgit2_init();
    if (result >= 0) {
      git_libgit2_opts(GIT_OPT_SET_SERVER_CONNECT_TIMEOUT, 15000);
      git_libgit2_opts(GIT_OPT_SET_SERVER_TIMEOUT, 45000);
    }
    return result;
  }();
  try {
    checkGit(initialized);
    const auto input = Json::parse(request);
    const auto operation = input.at("operation").get<std::string>();
    if (operation == "list-archived-projects") {
      Json archives = Json::array();
      fs::create_directories(base);
      const std::regex archivedId("([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-"
                                  "9]{4}-[a-f0-9]{12})[.]deleted");
      for (const auto &entry : fs::directory_iterator(base)) {
        const auto status = entry.symlink_status();
        std::smatch match;
        const auto name = entry.path().filename().string();
        if (fs::is_directory(status) &&
            std::regex_match(name, match, archivedId))
          archives.push_back(match[1].str());
      }
      return Json({{"ok", true}, {"data", archives}}).dump();
    }
    const auto id = input.at("projectId").get<std::string>();
    if (!std::regex_match(id, std::regex("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-["
                                         "a-f0-9]{4}-[a-f0-9]{12}")))
      throw WorkspaceError("INVALID_PROJECT", "Invalid local project ID.");
    std::shared_ptr<std::mutex> projectMutex;
    {
      std::lock_guard<std::mutex> lock(registryMutex);
      if (locks.size() > 256)
        for (auto i = locks.begin(); i != locks.end();) {
          if (i->second.expired())
            i = locks.erase(i);
          else
            ++i;
        }
      auto &entry = locks[base + "/" + id];
      projectMutex = entry.lock();
      if (!projectMutex) {
        projectMutex = std::make_shared<std::mutex>();
        entry = projectMutex;
      }
    }
    // Save and checkout share a per-project lock. Fetching one project must not
    // block local reads or saves in a different project.
    std::lock_guard<std::mutex> projectLock(*projectMutex);
    const auto args = input.value("args", Json::object());
    const fs::path root = fs::path(base) / id;
    fs::create_directories(base);
    if (fs::is_symlink(fs::symlink_status(root)))
      throw WorkspaceError("INVALID_PROJECT", "Invalid local project folder.");
    Json data;
    const auto archive = fs::path(base) / (id + ".deleted");
    if (fs::is_symlink(fs::symlink_status(archive)))
      throw WorkspaceError("INVALID_PROJECT",
                           "Invalid archived project folder.");
    if (operation == "archive-project") {
      if (!fs::is_directory(root) || fs::exists(archive))
        throw WorkspaceError("PROJECT_UNAVAILABLE",
                             "Unable to prepare project deletion.");
      fs::rename(root, archive);
      data = true;
    } else if (operation == "restore-project") {
      if (!fs::exists(root) && fs::is_directory(archive))
        fs::rename(archive, root);
      data = true;
    } else if (operation == "purge-project") {
      fs::remove_all(archive);
      data = true;
    } else if (operation == "clone") {
      if (fs::exists(root))
        throw WorkspaceError("PROJECT_EXISTS",
                             "This project already exists on the device.");
      try {
        cloneRepository(root, args);
      } catch (...) {
        fs::remove_all(root);
        throw;
      }
      data = true;
    } else if (operation == "initialize") {
      if (fs::exists(root))
        throw WorkspaceError("PROJECT_EXISTS",
                             "This project already exists on the device.");
      fs::create_directory(root);
      try {
        initializeGit(root);
      } catch (...) {
        fs::remove_all(root);
        throw;
      }
      data = true;
    } else {
      if (!fs::is_directory(root))
        throw WorkspaceError("PROJECT_NOT_FOUND",
                             "This project is not available on the device.");
      // Check while holding the same project mutex as the eventual operation.
      if (input.contains("expectedRevision") &&
          input.at("expectedRevision") != gitOperation(root, "git/revision", Json::object()))
        throw WorkspaceError("WORKSPACE_CHANGED",
                             "The workspace changed after this task started. Please try again.");
      data = operation.rfind("git/", 0) == 0
                 ? gitOperation(root, operation, args)
                 : fileOperation(root, operation, args);
    }
    Json response = {{"ok", true}, {"data", data}};
    if (input.contains("expectedRevision"))
      response["revision"] = gitOperation(root, "git/revision", Json::object());
    return response.dump();
  } catch (const WorkspaceError &error) {
    return Json(
               {{"ok", false}, {"code", error.code}, {"message", error.what()}})
        .dump();
  } catch (const std::exception &) {
    return Json({{"ok", false},
                 {"code", "LOCAL_WORKSPACE_ERROR"},
                 {"message",
                  "Unable to complete the operation on this device."}})
        .dump();
  }
}
} // namespace codaloud
