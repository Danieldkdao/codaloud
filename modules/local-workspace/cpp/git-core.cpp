#include "git.hpp"
#include <algorithm>
#include <set>

namespace codaloud {
void checkGit(int result, const std::string &code) {
  if (result >= 0)
    return;
  const auto error = git_error_last();
  throw WorkspaceError(code, error && error->message
                                 ? error->message
                                 : "Unable to complete this Git operation.");
}

std::string oidString(const git_oid *oid) {
  char output[GIT_OID_SHA1_HEXSIZE + 1];
  git_oid_tostr(output, sizeof(output), oid);
  return output;
}

void initializeGit(const fs::path &root) {
  Repository repo;
  git_repository_init_options options = GIT_REPOSITORY_INIT_OPTIONS_INIT;
  options.initial_head = "main";
  options.flags = GIT_REPOSITORY_INIT_NO_REINIT;
  checkGit(git_repository_init_ext(repo.out(), root.c_str(), &options));
}

void openRepository(Repository &repo, const fs::path &root) {
  if (!fs::is_directory(fs::symlink_status(root / ".git")))
    throw WorkspaceError("NOT_INITIALIZED",
                         "This project has no local Git repository.");
  checkGit(git_repository_open_ext(repo.out(), root.c_str(),
                                   GIT_REPOSITORY_OPEN_NO_SEARCH, nullptr));
  const auto workdir = git_repository_workdir(repo.get());
  if (!workdir || fs::canonical(workdir) != fs::canonical(root) ||
      fs::canonical(git_repository_path(repo.get())) !=
          fs::canonical(root / ".git"))
    throw WorkspaceError("INVALID_REPOSITORY",
                         "This repository points outside the local project.");
}

Json currentBranch(git_repository *repo) {
  Reference head;
  if (git_repository_head_detached(repo) == 1)
    return nullptr;
  const auto status = git_repository_head(head.out(), repo);
  if (status == GIT_EUNBORNBRANCH) {
    Reference symbolic;
    checkGit(git_reference_lookup(symbolic.out(), repo, "HEAD"));
    const char *target = git_reference_symbolic_target(symbolic.get());
    if (target && std::string(target).rfind("refs/heads/", 0) == 0)
      return std::string(target).substr(11);
    return nullptr;
  }
  checkGit(status);
  return std::string(git_reference_shorthand(head.get()));
}

Json gitCounts(git_repository *repo) {
  Json counts = {{"currentBranch", currentBranch(repo)},
                 {"headSha", nullptr},
                 {"upstream", nullptr},
                 {"upstreamSha", nullptr},
                 {"outgoing", nullptr},
                 {"incoming", nullptr},
                 {"isShallow", git_repository_is_shallow(repo) == 1},
                 {"observedAt", timestamp()}};
  Reference head;
  const auto status = git_repository_head(head.out(), repo);
  if (status == GIT_EUNBORNBRANCH || status == GIT_ENOTFOUND)
    return counts;
  checkGit(status);
  counts["headSha"] = oidString(git_reference_target(head.get()));
  if (!counts["currentBranch"].is_null()) {
    Reference upstream;
    const auto upstreamStatus = git_branch_upstream(upstream.out(), head.get());
    if (upstreamStatus != GIT_ENOTFOUND) {
      checkGit(upstreamStatus);
      counts["upstream"] = git_reference_shorthand(upstream.get());
      counts["upstreamSha"] = oidString(git_reference_target(upstream.get()));
      size_t ahead = 0, behind = 0;
      const auto graphStatus = git_graph_ahead_behind(
          &ahead, &behind, repo, git_reference_target(head.get()),
          git_reference_target(upstream.get()));
      if (graphStatus >= 0) {
        counts["outgoing"] = ahead;
        counts["incoming"] = behind;
      } else if (!counts["isShallow"].get<bool>())
        checkGit(graphStatus);
    }
  }
  return counts;
}

void requireMutableBranch(git_repository *repo) {
  if (git_repository_head_detached(repo) == 1)
    throw WorkspaceError(
        "DETACHED_HEAD",
        "Check out a branch before changing repository history.");
  if (git_repository_state(repo) != GIT_REPOSITORY_STATE_NONE)
    throw WorkspaceError("GIT_OPERATION_IN_PROGRESS",
                         "Finish the current Git operation first.");
  Index index;
  checkGit(git_repository_index(index.out(), repo));
  if (git_index_has_conflicts(index.get()))
    throw WorkspaceError("UNRESOLVED_CONFLICTS",
                         "Resolve the file conflicts before continuing.");
}

void checkoutAndUpdateHead(git_repository *repo, const git_oid *next,
                           const git_oid *expected) {
  Commit target;
  checkGit(git_commit_lookup(target.out(), repo, next));
  git_checkout_options options = GIT_CHECKOUT_OPTIONS_INIT;
  options.checkout_strategy = GIT_CHECKOUT_SAFE;
  checkGit(git_checkout_tree(repo, reinterpret_cast<git_object *>(target.get()),
                             &options));
  const auto branch = currentBranch(repo).get<std::string>();
  Reference updated;
  const auto status = git_reference_create_matching(
      updated.out(), repo, ("refs/heads/" + branch).c_str(), next, 1, expected,
      "update: Codaloud");
  if (status < 0) {
    Commit previous;
    if (git_commit_lookup(previous.out(), repo, expected) < 0 ||
        git_checkout_tree(repo, reinterpret_cast<git_object *>(previous.get()),
                          &options) < 0)
      throw WorkspaceError("HEAD_UPDATE_OUTCOME_UNKNOWN",
                           "The branch could not be updated. Review Git "
                           "changes before retrying.");
    checkGit(status);
  }
}

void createSignature(Signature &signature, const Json &args) {
  const auto identity = args.at("identity");
  const auto name = identity.at("name").get<std::string>();
  const auto email = identity.at("email").get<std::string>();
  if (name.empty() || email.empty())
    throw WorkspaceError("GIT_IDENTITY_REQUIRED",
                         "Set your Git name and email in Settings.");
  checkGit(git_signature_now(signature.out(), name.c_str(), email.c_str()));
}

static void validateBranch(const std::string &name) {
  int valid = 0;
  checkGit(git_branch_name_is_valid(&valid, name.c_str()));
  if (!valid || name.rfind("refs/", 0) == 0 || name.front() == '-')
    throw WorkspaceError("INVALID_BRANCH", "Choose a valid branch name.");
}

static Json checkoutBranch(git_repository *repo, const Json &args,
                           bool create) {
  requireMutableBranch(repo);
  const auto name = args.at("branchName").get<std::string>();
  validateBranch(name);
  const auto previous = currentBranch(repo);
  Reference branch;
  bool created = false;
  if (create) {
    Commit head;
    git_oid headId;
    checkGit(git_reference_name_to_id(&headId, repo, "HEAD"));
    checkGit(git_commit_lookup(head.out(), repo, &headId));
    checkGit(
        git_branch_create(branch.out(), repo, name.c_str(), head.get(), 0));
    created = true;
  } else {
    auto status =
        git_branch_lookup(branch.out(), repo, name.c_str(), GIT_BRANCH_LOCAL);
    if (status == GIT_ENOTFOUND) {
      Reference remote;
      checkGit(git_branch_lookup(remote.out(), repo, ("origin/" + name).c_str(),
                                 GIT_BRANCH_REMOTE));
      Commit target;
      checkGit(git_commit_lookup(target.out(), repo,
                                 git_reference_target(remote.get())));
      checkGit(
          git_branch_create(branch.out(), repo, name.c_str(), target.get(), 0));
      created = true;
      try {
        checkGit(
            git_branch_set_upstream(branch.get(), ("origin/" + name).c_str()));
      } catch (...) {
        git_branch_delete(branch.get());
        throw;
      }
    } else
      checkGit(status);
  }
  try {
    Object target;
    checkGit(git_reference_peel(target.out(), branch.get(), GIT_OBJECT_COMMIT));
    git_checkout_options options = GIT_CHECKOUT_OPTIONS_INIT;
    options.checkout_strategy =
        GIT_CHECKOUT_SAFE | GIT_CHECKOUT_RECREATE_MISSING;
    checkGit(git_checkout_tree(repo, target.get(), &options),
             "CHECKOUT_CONFLICT");
    checkGit(git_repository_set_head(repo, git_reference_name(branch.get())));
  } catch (...) {
    if (created)
      git_branch_delete(branch.get());
    throw;
  }
  Json result = {{"previousBranch", previous}, {"currentBranch", name}};
  if (create)
    result["headSha"] = oidString(git_reference_target(branch.get()));
  return result;
}

static Json commitFiles(git_repository *repo, const fs::path &root,
                        const Json &args) {
  requireMutableBranch(repo);
  const auto message = args.at("message").get<std::string>();
  const auto paths = args.at("paths").get<std::vector<std::string>>();
  if (message.empty() || message.size() > 20000 ||
      message.find('\0') != std::string::npos || paths.empty() ||
      paths.size() > 5000)
    throw WorkspaceError("INVALID_COMMIT_INPUT",
                         "Select files and enter a commit message.");
  std::set<std::string> selected(paths.begin(), paths.end());
  if (selected.size() != paths.size())
    throw WorkspaceError("INVALID_COMMIT_INPUT", "Select unique file paths.");
  StatusList changes;
  git_status_options statusOptions = GIT_STATUS_OPTIONS_INIT;
  statusOptions.flags = GIT_STATUS_OPT_INCLUDE_UNTRACKED |
                        GIT_STATUS_OPT_RECURSE_UNTRACKED_DIRS |
                        GIT_STATUS_OPT_RENAMES_HEAD_TO_INDEX |
                        GIT_STATUS_OPT_RENAMES_INDEX_TO_WORKDIR;
  checkGit(git_status_list_new(changes.out(), repo, &statusOptions));
  // Selecting the destination of a detected rename also removes its old path.
  // Other staged files are intentionally left out of this commit's tree.
  for (size_t i = 0; i < git_status_list_entrycount(changes.get()); i++) {
    const auto change = git_status_byindex(changes.get(), i);
    for (const auto delta : {change->head_to_index, change->index_to_workdir}) {
      if (delta && delta->status == GIT_DELTA_RENAMED &&
          selected.count(delta->new_file.path))
        selected.insert(delta->old_file.path);
    }
  }
  Index index, commitIndex;
  checkGit(git_repository_index(index.out(), repo));
  checkGit(git_index_new(commitIndex.out()));
  Commit parent;
  Tree parentTree;
  git_oid parentId;
  const auto headStatus = git_reference_name_to_id(&parentId, repo, "HEAD");
  if (headStatus != GIT_ENOTFOUND && headStatus != GIT_EUNBORNBRANCH) {
    checkGit(headStatus);
    checkGit(git_commit_lookup(parent.out(), repo, &parentId));
    checkGit(git_commit_tree(parentTree.out(), parent.get()));
    checkGit(git_index_read_tree(commitIndex.get(), parentTree.get()));
  }
  for (const auto &relative : selected) {
    const auto path = checkedPath(root, relative, false, true);
    if (fs::is_regular_file(fs::symlink_status(path)) ||
        fs::is_symlink(fs::symlink_status(path))) {
      checkGit(git_index_add_bypath(index.get(), relative.c_str()));
      checkGit(git_index_add(
          commitIndex.get(),
          git_index_get_bypath(index.get(), relative.c_str(), 0)));
    } else if (!fs::exists(path)) {
      if (!git_index_get_bypath(index.get(), relative.c_str(), 0) &&
          !git_index_get_bypath(commitIndex.get(), relative.c_str(), 0))
        throw WorkspaceError("FILE_NOT_FOUND",
                             "A selected file no longer exists.");
      const auto removeIndex =
          git_index_remove_bypath(index.get(), relative.c_str());
      if (removeIndex != GIT_ENOTFOUND)
        checkGit(removeIndex);
      const auto removeCommit =
          git_index_remove_bypath(commitIndex.get(), relative.c_str());
      if (removeCommit != GIT_ENOTFOUND)
        checkGit(removeCommit);
    } else
      throw WorkspaceError("UNSUPPORTED_FILE",
                           "Select regular files to commit.");
  }
  git_oid treeId;
  checkGit(git_index_write_tree_to(&treeId, commitIndex.get(), repo));
  if (parent.get() && git_oid_equal(&treeId, git_commit_tree_id(parent.get())))
    throw WorkspaceError("NO_CHANGES",
                         "The selected files have no changes to commit.");
  Tree tree;
  checkGit(git_tree_lookup(tree.out(), repo, &treeId));
  Signature signature;
  createSignature(signature, args);
  git_oid commitId;
  const git_commit *parents[] = {parent.get()};
  checkGit(git_commit_create(&commitId, repo, nullptr, signature.get(),
                             signature.get(), "UTF-8", message.c_str(),
                             tree.get(), parent.get() ? 1 : 0,
                             parent.get() ? parents : nullptr));
  const auto branchName = currentBranch(repo).get<std::string>();
  const auto referenceName = "refs/heads/" + branchName;
  // Preserve the original index in memory until the new commit object exists.
  // Publishing the index first leaves recoverable staged work after a crash.
  Index original;
  checkGit(git_index_open(original.out(), git_index_path(index.get())));
  checkGit(git_index_write(index.get()));
  Reference updated;
  const auto status =
      parent.get()
          ? git_reference_create_matching(updated.out(), repo,
                                          referenceName.c_str(), &commitId, 1,
                                          &parentId, "commit: Codaloud")
          : git_reference_create(updated.out(), repo, referenceName.c_str(),
                                 &commitId, 0, "commit: Codaloud");
  if (status < 0) {
    const auto rollbackStatus = git_index_write(original.get());
    if (rollbackStatus < 0)
      throw WorkspaceError("COMMIT_INDEX_CHANGED",
                           "The commit was not published, but staging changed. "
                           "Review Git changes before retrying.");
    checkGit(status);
  }
  return {{"hash", oidString(&commitId)},
          {"currentBranch", branchName},
          {"parentHash",
           parent.get() ? Json(oidString(&parentId)) : Json(nullptr)}};
}

Json gitOperation(const fs::path &root, const std::string &operation,
                  const Json &args) {
  Repository repo;
  openRepository(repo, root);
  if (operation == "git/counts")
    return gitCounts(repo.get());
  if (operation == "git/commit")
    return commitFiles(repo.get(), root, args);
  if (operation == "git/checkout" || operation == "git/create-branch")
    return checkoutBranch(repo.get(), args, operation == "git/create-branch");
  if (operation == "git/branches") {
    BranchIterator iterator;
    const bool remote = args.value("source", "local") == "remote";
    checkGit(
        git_branch_iterator_new(iterator.out(), repo.get(),
                                remote ? GIT_BRANCH_REMOTE : GIT_BRANCH_LOCAL));
    std::set<std::string> names;
    int status;
    while (true) {
      Reference branch;
      git_branch_t type;
      status = git_branch_next(branch.out(), &type, iterator.get());
      if (status == GIT_ITEROVER)
        break;
      checkGit(status);
      const char *name;
      checkGit(git_branch_name(&name, branch.get()));
      std::string label = name;
      if (remote) {
        if (label.rfind("origin/", 0) != 0 || label == "origin/HEAD")
          continue;
        label = label.substr(7);
      }
      names.insert(label);
      if (names.size() > 50000)
        throw WorkspaceError("TOO_MANY_BRANCHES",
                             "This repository contains too many branches.");
    }
    const auto active = currentBranch(repo.get());
    if (!remote && !active.is_null())
      names.insert(active.get<std::string>());
    return {{"branches", names}, {"currentBranch", active}};
  }
  return gitReadOperation(repo.get(), operation, args);
}
} // namespace codaloud
