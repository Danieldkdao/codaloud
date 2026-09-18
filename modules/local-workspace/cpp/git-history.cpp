#include "git.hpp"

namespace codaloud {
Json commitMetadata(git_commit *commit, bool detailed) {
  const auto author = git_commit_author(commit);
  const auto committer = git_commit_committer(commit);
  Json parents = Json::array();
  const auto count = git_commit_parentcount(commit);
  for (unsigned int i = 0; i < count; i++) parents.push_back(oidString(git_commit_parent_id(commit, i)));
  Json result = {{"hash", oidString(git_commit_id(commit))}, {"message", git_commit_message(commit) ? git_commit_message(commit) : ""},
    {"author", author->name}, {"authorEmail", author->email}, {"committedAt", timestamp(committer->when.time)},
    {"parentHashes", parents}, {"isMerge", count > 1}};
  if (detailed) {
    result["authoredAt"] = timestamp(author->when.time);
    result["committer"] = committer->name;
    result["committerEmail"] = committer->email;
  }
  return result;
}

static Json history(git_repository *repo, const Json &args) {
  const int limit = args.value("limit", 100);
  const int offset = args.value("offset", 0);
  if (limit < 1 || limit > 1000 || offset < 0 || offset > 10000000) throw WorkspaceError("INVALID_CURSOR", "Start a new commit history search.");
  git_oid snapshot;
  int status;
  if (args.contains("snapshotSha") && !args.at("snapshotSha").is_null()) {
    const auto sha = args.at("snapshotSha").get<std::string>();
    if (sha.size() != GIT_OID_SHA1_HEXSIZE) throw WorkspaceError("INVALID_CURSOR", "Invalid history snapshot.");
    status = git_oid_fromstr(&snapshot, sha.c_str());
  } else {
    const auto branch = args.at("branch").get<std::string>();
    int valid = 0;
    checkGit(git_branch_name_is_valid(&valid, branch.c_str()));
    if (!valid) throw WorkspaceError("INVALID_BRANCH", "Select a valid branch.");
    status = git_reference_name_to_id(&snapshot, repo, ("refs/heads/" + branch).c_str());
    if ((status == GIT_ENOTFOUND || status == GIT_EUNBORNBRANCH) && currentBranch(repo) == branch && git_repository_head_unborn(repo) == 1)
      return {{"commits", Json::array()}, {"snapshotSha", nullptr}, {"nextOffset", nullptr}, {"isShallow", false}};
  }
  checkGit(status);
  Revwalk walk;
  checkGit(git_revwalk_new(walk.out(), repo));
  checkGit(git_revwalk_sorting(walk.get(), GIT_SORT_TOPOLOGICAL | GIT_SORT_TIME));
  checkGit(git_revwalk_push(walk.get(), &snapshot));
  git_oid id;
  for (int i = 0; i < offset; i++) {
    status = git_revwalk_next(&id, walk.get());
    if (status == GIT_ITEROVER) throw WorkspaceError("INVALID_CURSOR", "This history position is no longer available.");
    checkGit(status);
  }
  Json commits = Json::array();
  size_t responseBytes = 0;
  for (int i = 0; i < limit; i++) {
    status = git_revwalk_next(&id, walk.get());
    if (status == GIT_ITEROVER) break;
    checkGit(status);
    Commit commit;
    checkGit(git_commit_lookup(commit.out(), repo, &id));
    commits.push_back(commitMetadata(commit.get()));
    responseBytes += commits.back().dump().size();
    if (responseBytes > 8 * 1024 * 1024) throw WorkspaceError("HISTORY_TOO_LARGE", "This history page exceeds the preview limit.");
  }
  status = git_revwalk_next(&id, walk.get());
  if (status != GIT_ITEROVER) checkGit(status);
  return {{"commits", commits}, {"snapshotSha", oidString(&snapshot)},
    {"nextOffset", status == GIT_ITEROVER ? Json(nullptr) : Json(offset + commits.size())},
    {"isShallow", git_repository_is_shallow(repo) == 1}};
}

static Json commitDetails(git_repository *repo, const Json &args) {
  git_oid id;
  const auto sha = args.at("commitSha").get<std::string>();
  if (sha.size() != GIT_OID_SHA1_HEXSIZE) throw WorkspaceError("INVALID_COMMIT", "Select a full commit hash.");
  checkGit(git_oid_fromstr(&id, sha.c_str()));
  Commit commit, parent;
  Tree tree, base;
  checkGit(git_commit_lookup(commit.out(), repo, &id));
  checkGit(git_commit_tree(tree.out(), commit.get()));
  Json baseSha = nullptr;
  if (git_commit_parentcount(commit.get())) {
    checkGit(git_commit_parent(parent.out(), commit.get(), 0));
    checkGit(git_commit_tree(base.out(), parent.get()));
    baseSha = oidString(git_commit_id(parent.get()));
  }
  Diff diff;
  git_diff_options options = GIT_DIFF_OPTIONS_INIT;
  options.flags = GIT_DIFF_INCLUDE_TYPECHANGE;
  options.max_size = 1024 * 1024;
  checkGit(git_diff_tree_to_tree(diff.out(), repo, base.get(), tree.get(), &options));
  git_diff_find_options find = GIT_DIFF_FIND_OPTIONS_INIT;
  find.flags = GIT_DIFF_FIND_RENAMES;
  checkGit(git_diff_find_similar(diff.get(), &find));
  const auto count = git_diff_num_deltas(diff.get());
  if (count > 5000) throw WorkspaceError("COMMIT_TOO_LARGE", "This commit contains too many files to display.");
  Json files = Json::array();
  size_t additions = 0, deletions = 0, unavailable = 0, responseBytes = 0;
  for (size_t i = 0; i < count; i++) {
    const auto delta = git_diff_get_delta(diff.get(), i);
    const auto patch = diffPatch(diff.get(), i);
    if (patch.at("unavailableReason").is_null()) {
      additions += patch.at("additions").get<size_t>();
      deletions += patch.at("deletions").get<size_t>();
    } else unavailable++;
    files.push_back({{"path", delta->new_file.path},
      {"originalPath", delta->status == GIT_DELTA_RENAMED || delta->status == GIT_DELTA_COPIED ? Json(delta->old_file.path) : Json(nullptr)},
      {"status", deltaState(delta->status)}, {"beforeMode", fileMode(delta->old_file.mode)},
      {"afterMode", fileMode(delta->new_file.mode)}, {"diff", patch}});
    responseBytes += files.back().dump().size();
    if (responseBytes > 8 * 1024 * 1024) throw WorkspaceError("DIFF_TOO_LARGE", "This commit exceeds the diff preview limit.");
  }
  return {{"source", "local"}, {"commit", commitMetadata(commit.get(), true)}, {"baseSha", baseSha},
    {"files", files}, {"githubUrl", nullptr}, {"summary", {{"fileCount", count}, {"additions", additions}, {"deletions", deletions}, {"unavailableCount", unavailable}}}};
}

Json gitReadOperation(git_repository *repo, const std::string &operation, const Json &args) {
  if (operation == "git/changes") return gitChanges(repo);
  if (operation == "git/history") return history(repo, args);
  if (operation == "git/commit-details") return commitDetails(repo, args);
  return gitMutation(repo, operation, args);
}
}
