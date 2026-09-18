#include "git.hpp"
#include <iomanip>
#include <sstream>

namespace codaloud {
std::string fileMode(uint32_t mode) {
  std::ostringstream output;
  output << std::oct << std::setfill('0') << std::setw(6) << mode;
  return output.str();
}

std::string deltaState(git_delta_t status) {
  switch (status) {
    case GIT_DELTA_ADDED: return "added";
    case GIT_DELTA_DELETED: return "deleted";
    case GIT_DELTA_MODIFIED: return "modified";
    case GIT_DELTA_RENAMED: return "renamed";
    case GIT_DELTA_COPIED: return "copied";
    case GIT_DELTA_TYPECHANGE: return "type-changed";
    case GIT_DELTA_UNTRACKED: return "untracked";
    case GIT_DELTA_CONFLICTED: return "unmerged";
    default: return "unchanged";
  }
}

static Json unavailable(const char *reason) {
  return {{"patch", nullptr}, {"additions", nullptr}, {"deletions", nullptr}, {"unavailableReason", reason}};
}

Json diffPatch(git_diff *diff, size_t index) {
  const auto delta = git_diff_get_delta(diff, index);
  if (delta->status == GIT_DELTA_CONFLICTED) return unavailable("conflict");
  if (delta->old_file.mode == GIT_FILEMODE_COMMIT || delta->new_file.mode == GIT_FILEMODE_COMMIT) return unavailable("unsupported");
  if (delta->old_file.size > 1024 * 1024 || delta->new_file.size > 1024 * 1024) return unavailable("too-large");
  Patch patch;
  checkGit(git_patch_from_diff(patch.out(), diff, index));
  if (!patch.get() || (delta->flags & GIT_DIFF_FLAG_BINARY)) return unavailable("binary");
  git_buf buffer = GIT_BUF_INIT;
  const auto status = git_patch_to_buf(&buffer, patch.get());
  if (status < 0) { git_buf_dispose(&buffer); checkGit(status); }
  if (buffer.size > 256 * 1024) { git_buf_dispose(&buffer); return unavailable("too-large"); }
  const std::string text(buffer.ptr ? buffer.ptr : "", buffer.size);
  git_buf_dispose(&buffer);
  // The editor transports UTF-8 JSON. Invalid encodings remain explicit omissions.
  try { Json(text).dump(); } catch (...) { return unavailable("unsupported"); }
  size_t additions = 0, deletions = 0;
  checkGit(git_patch_line_stats(nullptr, &additions, &deletions, patch.get()));
  return {{"patch", text}, {"additions", additions}, {"deletions", deletions}, {"unavailableReason", nullptr}};
}

static Json findPatch(git_diff *diff, const git_diff_delta *target) {
  if (!target) return nullptr;
  if (target->status == GIT_DELTA_CONFLICTED) return unavailable("conflict");
  for (size_t i = 0; i < git_diff_num_deltas(diff); i++) {
    const auto delta = git_diff_get_delta(diff, i);
    if (std::string(delta->new_file.path) == target->new_file.path && std::string(delta->old_file.path) == target->old_file.path) return diffPatch(diff, i);
  }
  return unavailable("unsupported");
}

Json gitChanges(git_repository *repo) {
  const auto counts = gitCounts(repo);
  Tree headTree;
  if (!counts.at("headSha").is_null()) {
    Object head;
    checkGit(git_revparse_single(head.out(), repo, "HEAD^{tree}"));
    git_oid treeId = *git_object_id(head.get());
    checkGit(git_tree_lookup(headTree.out(), repo, &treeId));
  }
  Index index;
  checkGit(git_repository_index(index.out(), repo));
  git_diff_options diffOptions = GIT_DIFF_OPTIONS_INIT;
  diffOptions.flags = GIT_DIFF_INCLUDE_UNTRACKED | GIT_DIFF_RECURSE_UNTRACKED_DIRS | GIT_DIFF_SHOW_UNTRACKED_CONTENT | GIT_DIFF_INCLUDE_TYPECHANGE;
  diffOptions.max_size = 1024 * 1024;
  Diff staged, unstaged;
  checkGit(git_diff_tree_to_index(staged.out(), repo, headTree.get(), index.get(), &diffOptions));
  checkGit(git_diff_index_to_workdir(unstaged.out(), repo, index.get(), &diffOptions));
  git_diff_find_options find = GIT_DIFF_FIND_OPTIONS_INIT;
  find.flags = GIT_DIFF_FIND_RENAMES | GIT_DIFF_FIND_FOR_UNTRACKED;
  checkGit(git_diff_find_similar(staged.get(), &find));
  checkGit(git_diff_find_similar(unstaged.get(), &find));
  StatusList status;
  git_status_options options = GIT_STATUS_OPTIONS_INIT;
  options.flags = GIT_STATUS_OPT_INCLUDE_UNTRACKED | GIT_STATUS_OPT_RECURSE_UNTRACKED_DIRS |
    GIT_STATUS_OPT_RENAMES_HEAD_TO_INDEX | GIT_STATUS_OPT_RENAMES_INDEX_TO_WORKDIR;
  checkGit(git_status_list_new(status.out(), repo, &options));
  const auto count = git_status_list_entrycount(status.get());
  if (count > 5000) throw WorkspaceError("TOO_MANY_CHANGES", "This repository has too many changes to display at once.");
  Json changes = Json::array();
  size_t responseBytes = 0;
  for (size_t i = 0; i < count; i++) {
    const auto change = git_status_byindex(status.get(), i);
    const auto head = change->head_to_index;
    const auto work = change->index_to_workdir;
    const auto path = work ? work->new_file.path : head->new_file.path;
    const auto old = head ? head->old_file.path : work->old_file.path;
    const auto headMode = head ? head->old_file.mode : work->old_file.mode;
    const auto indexMode = head ? head->new_file.mode : work->old_file.mode;
    const auto workMode = work ? work->new_file.mode : head->new_file.mode;
    const bool conflict = (change->status & GIT_STATUS_CONFLICTED) != 0;
    const bool renamed = (head && head->status == GIT_DELTA_RENAMED) || (work && work->status == GIT_DELTA_RENAMED);
    const auto mode = workMode ? workMode : indexMode ? indexMode : headMode;
    changes.push_back({{"path", path}, {"originalPath", renamed ? Json(old) : Json(nullptr)},
      {"indexStatus", conflict ? "unmerged" : head ? deltaState(head->status) : "unchanged"},
      {"worktreeStatus", conflict ? "unmerged" : work ? deltaState(work->status) : "unchanged"},
      {"isUntracked", (change->status & GIT_STATUS_WT_NEW) != 0}, {"isConflicted", conflict},
      {"kind", mode == GIT_FILEMODE_LINK ? "symlink" : mode == GIT_FILEMODE_COMMIT ? "submodule" : "file"},
      {"headMode", fileMode(headMode)}, {"indexMode", fileMode(indexMode)}, {"worktreeMode", fileMode(workMode)},
      {"staged", conflict ? unavailable("conflict") : findPatch(staged.get(), head)},
      {"unstaged", conflict ? unavailable("conflict") : findPatch(unstaged.get(), work)}});
    responseBytes += changes.back().dump().size();
    if (responseBytes > 8 * 1024 * 1024) throw WorkspaceError("DIFF_TOO_LARGE", "These changes exceed the diff preview limit.");
  }
  return {{"repositoryState", counts.at("headSha").is_null() ? "unborn" : "ready"},
    {"currentBranch", counts.at("currentBranch")}, {"headSha", counts.at("headSha")},
    {"isDetached", git_repository_head_detached(repo) == 1}, {"observedAt", timestamp()}, {"changes", changes}};
}
}
