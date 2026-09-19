#include "git.hpp"
#include <exception>
#include <set>

namespace codaloud {
static void readStatus(StatusList &status, git_repository *repo) {
  git_status_options options = GIT_STATUS_OPTIONS_INIT;
  options.flags =
      GIT_STATUS_OPT_INCLUDE_UNTRACKED | GIT_STATUS_OPT_RECURSE_UNTRACKED_DIRS;
  checkGit(git_status_list_new(status.out(), repo, &options));
}

bool hasChanges(git_repository *repo) {
  StatusList status;
  readStatus(status, repo);
  return git_status_list_entrycount(status.get()) != 0;
}

static Json listStashes(git_repository *repo) {
  struct Context {
    git_repository *repo;
    Json items = Json::array();
    std::exception_ptr error;
  } context{repo};
  const auto status = git_stash_foreach(
      repo,
      [](size_t index, const char *message, const git_oid *id, void *payload) {
        auto &context = *static_cast<Context *>(payload);
        try {
          if (index > 10000)
            throw WorkspaceError("TOO_MANY_STASHES",
                                 "This repository contains too many stashes.");
          Commit commit;
          checkGit(git_commit_lookup(commit.out(), context.repo, id));
          context.items.push_back(
              {{"index", index},
               {"sha", oidString(id)},
               {"message", message},
               {"createdAt", timestamp(git_commit_time(commit.get()))}});
          return 0;
        } catch (...) {
          context.error = std::current_exception();
          return static_cast<int>(GIT_EUSER);
        }
      },
      &context);
  if (context.error)
    std::rethrow_exception(context.error);
  checkGit(status);
  return context.items;
}

static Json stash(git_repository *repo, const std::string &operation,
                  const Json &args) {
  if (operation == "git/stashes")
    return listStashes(repo);
  requireMutableBranch(repo);
  if (operation == "git/stash-save") {
    Signature signature;
    createSignature(signature, args);
    git_oid id;
    const auto message = args.value("message", "Work saved from Codaloud");
    const auto status =
        git_stash_save(&id, repo, signature.get(), message.c_str(),
                       GIT_STASH_INCLUDE_UNTRACKED);
    if (status == GIT_ENOTFOUND)
      return {{"created", false},
              {"remainingChanges", hasChanges(repo)},
              {"stashSha", nullptr}};
    checkGit(status);
    return {{"created", true},
            {"remainingChanges", hasChanges(repo)},
            {"stashSha", oidString(&id)}};
  }
  const auto index = args.at("stashIndex").get<size_t>();
  const auto expected = args.at("stashSha").get<std::string>();
  const auto stashes = listStashes(repo);
  if (index >= stashes.size() || stashes.at(index).at("sha") != expected)
    throw WorkspaceError("STASH_CHANGED",
                         "The stash list changed. Refresh before continuing.");
  if (operation == "git/stash-drop") {
    checkGit(git_stash_drop(repo, index));
    return {{"stashSha", expected}, {"dropped", true}};
  }
  git_stash_apply_options options = GIT_STASH_APPLY_OPTIONS_INIT;
  options.flags = args.value("restoreIndex", false)
                      ? GIT_STASH_APPLY_REINSTATE_INDEX
                      : GIT_STASH_APPLY_DEFAULT;
  options.checkout_options.checkout_strategy = GIT_CHECKOUT_SAFE;
  checkGit(git_stash_apply(repo, index, &options), "STASH_APPLY_CONFLICT");
  // Applying keeps the backup; the UI offers a separate, explicit drop action.
  return {{"stashSha", expected}, {"dropped", false}};
}

static Json discardPreview(git_repository *repo) {
  requireMutableBranch(repo);
  const auto counts = gitCounts(repo);
  if (counts.at("headSha").is_null())
    throw WorkspaceError(
        "UNBORN_HEAD",
        "Create a first commit before discarding tracked changes.");
  StatusList status;
  readStatus(status, repo);
  if (git_status_list_entrycount(status.get()) > 10000)
    throw WorkspaceError("TOO_MANY_CHANGES",
                         "Too many changes to verify safely.");
  std::set<std::string> paths;
  for (size_t i = 0; i < git_status_list_entrycount(status.get()); i++) {
    const auto change = git_status_byindex(status.get(), i);
    for (const auto delta : {change->head_to_index, change->index_to_workdir}) {
      if (delta) {
        paths.insert(delta->old_file.path);
        paths.insert(delta->new_file.path);
      }
    }
  }
  Json files = Json::array();
  for (const auto &relative : paths) {
    const auto path =
        checkedPath(git_repository_workdir(repo), relative, false, true);
    const auto info = fs::symlink_status(path);
    Json hash = nullptr;
    if (fs::is_symlink(info))
      hash = sha256(fs::read_symlink(path).string());
    else if (fs::is_regular_file(info))
      hash = sha256File(path);
    else if (fs::is_directory(info))
      throw WorkspaceError("DIRECTORY_CONFLICT",
                           "Move the folder replacing a tracked file before "
                           "discarding changes.");
    files.push_back({{"path", relative},
                     {"hash", hash},
                     {"mode", static_cast<unsigned int>(info.permissions())}});
  }
  const auto indexPath = fs::path(git_repository_path(repo)) / "index";
  const auto fingerprint = sha256(
      Json({{"head", counts.at("headSha")},
            {"index", fs::exists(indexPath) ? sha256File(indexPath) : ""},
            {"files", files}})
          .dump());
  return {{"currentBranch", counts.at("currentBranch")},
          {"headSha", counts.at("headSha")},
          {"changedPaths", paths},
          {"fingerprint", fingerprint}};
}

static Json discard(git_repository *repo, const Json &args) {
  const auto preview = discardPreview(repo);
  if (!args.value("confirm", false) ||
      args.at("fingerprint") != preview.at("fingerprint"))
    throw WorkspaceError("DISCARD_PREVIEW_STALE",
                         "The files changed after preview. Review the changes "
                         "again before discarding.");
  Object head;
  checkGit(git_revparse_single(head.out(), repo, "HEAD"));
  git_checkout_options options = GIT_CHECKOUT_OPTIONS_INIT;
  options.checkout_strategy = GIT_CHECKOUT_FORCE;
  if (args.value("includeUntracked", false))
    options.checkout_strategy |= GIT_CHECKOUT_REMOVE_UNTRACKED;
  checkGit(git_reset(repo, head.get(), GIT_RESET_HARD, &options));
  return {{"headSha", preview.at("headSha")},
          {"remainingChanges", hasChanges(repo)}};
}

static Json undo(git_repository *repo, const Json &args) {
  requireMutableBranch(repo);
  git_oid headId;
  checkGit(git_reference_name_to_id(&headId, repo, "HEAD"));
  Commit head, parent;
  checkGit(git_commit_lookup(head.out(), repo, &headId));
  if (git_commit_parentcount(head.get()) == 0)
    throw WorkspaceError("NO_PARENT_COMMIT",
                         "The first commit has no parent to reset to.");
  checkGit(git_commit_parent(parent.out(), head.get(), 0));
  const auto mode = args.at("mode").get<std::string>();
  git_reset_t resetMode;
  if (mode == "soft")
    resetMode = GIT_RESET_SOFT;
  else if (mode == "mixed")
    resetMode = GIT_RESET_MIXED;
  else if (mode == "hard")
    resetMode = GIT_RESET_HARD;
  else
    throw WorkspaceError("INVALID_RESET_MODE", "Choose a valid reset mode.");
  checkGit(git_reset(repo, reinterpret_cast<git_object *>(parent.get()),
                     resetMode, nullptr));
  return {{"previousHeadSha", oidString(&headId)},
          {"headSha", oidString(git_commit_id(parent.get()))},
          {"currentBranch", currentBranch(repo)},
          {"mode", mode}};
}

static Json revert(git_repository *repo, const Json &args) {
  requireMutableBranch(repo);
  if (hasChanges(repo))
    throw WorkspaceError("DIRTY_WORKTREE",
                         "Commit or stash your changes before reverting.");
  git_oid headId;
  checkGit(git_reference_name_to_id(&headId, repo, "HEAD"));
  Commit head;
  checkGit(git_commit_lookup(head.out(), repo, &headId));
  Index result;
  const auto mainline = args.value("mainline", 0u);
  checkGit(git_revert_commit(result.out(), repo, head.get(), head.get(),
                             mainline, nullptr));
  if (git_index_has_conflicts(result.get()))
    throw WorkspaceError("REVERT_CONFLICT",
                         "This revert has conflicts. No files were changed.");
  git_oid treeId, commitId;
  checkGit(git_index_write_tree_to(&treeId, result.get(), repo));
  Tree tree;
  checkGit(git_tree_lookup(tree.out(), repo, &treeId));
  Signature signature;
  createSignature(signature, args);
  const std::string message =
      std::string("Revert \"") + git_commit_summary(head.get()) +
      "\"\n\nThis reverts commit " + oidString(&headId) + ".\n";
  const git_commit *parents[] = {head.get()};
  checkGit(git_commit_create(&commitId, repo, nullptr, signature.get(),
                             signature.get(), "UTF-8", message.c_str(),
                             tree.get(), 1, parents));
  Commit created;
  checkGit(git_commit_lookup(created.out(), repo, &commitId));
  git_checkout_options options = GIT_CHECKOUT_OPTIONS_INIT;
  options.checkout_strategy = GIT_CHECKOUT_SAFE;
  checkGit(git_checkout_tree(
      repo, reinterpret_cast<git_object *>(created.get()), &options));
  const auto branch = currentBranch(repo).get<std::string>();
  Reference updated;
  const auto status = git_reference_create_matching(
      updated.out(), repo, ("refs/heads/" + branch).c_str(), &commitId, 1,
      &headId, "revert: Codaloud");
  if (status < 0) {
    const auto rollback = git_checkout_tree(
        repo, reinterpret_cast<git_object *>(head.get()), &options);
    if (rollback < 0)
      throw WorkspaceError("REVERT_OUTCOME_UNKNOWN",
                           "The revert was not published, but files changed. "
                           "Review Git changes before retrying.");
    checkGit(status);
  }
  return {{"hash", oidString(&commitId)},
          {"parentHash", oidString(&headId)},
          {"currentBranch", branch}};
}

Json gitMutation(git_repository *repo, const std::string &operation,
                 const Json &args) {
  if (operation == "git/stashes" || operation == "git/stash-save" ||
      operation == "git/stash-apply" || operation == "git/stash-drop")
    return stash(repo, operation, args);
  if (operation == "git/discard-preview")
    return discardPreview(repo);
  if (operation == "git/discard")
    return discard(repo, args);
  if (operation == "git/undo")
    return undo(repo, args);
  if (operation == "git/revert")
    return revert(repo, args);
  return gitRemoteOperation(repo, operation, args);
}
} // namespace codaloud
