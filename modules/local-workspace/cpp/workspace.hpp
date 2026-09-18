#pragma once
#include <filesystem>
#include <stdexcept>
#include <string>
#include <nlohmann/json.hpp>

namespace codaloud {
namespace fs = std::filesystem;
using Json = nlohmann::json;
struct WorkspaceError : std::runtime_error {
  std::string code;
  WorkspaceError(std::string code, std::string message) : std::runtime_error(message), code(std::move(code)) {}
};
std::string execute(const std::string &base, const std::string &request);
fs::path checkedPath(const fs::path &root, const std::string &relative, bool allowRoot = false, bool allowLeafSymlink = false);
std::string readText(const fs::path &path);
std::string sha256(const std::string &value);
std::string timestamp(std::time_t time = std::time(nullptr));
Json fileOperation(const fs::path &root, const std::string &operation, const Json &args);
}
