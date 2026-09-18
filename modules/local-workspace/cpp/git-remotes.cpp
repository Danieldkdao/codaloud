#include "git.hpp"
#include <regex>

namespace codaloud {
using Remote = GitHandle<git_remote, git_remote_free>;
using AnnotatedCommit = GitHandle<git_annotated_commit, git_annotated_commit_free>;
using Rebase = GitHandle<git_rebase, git_rebase_free>;

static bool allowedRemote(const std::string &url) {
#ifdef CODALOUD_NATIVE_TEST_TRANSPORT
  if (url.rfind("file:///", 0) == 0) return true;
#endif
  return std::regex_match(url, std::regex("https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"));
}

struct RemoteContext {
  std::string token;
  bool force = false;
  Json expected = nullptr;
  bool leaseChanged = false;
  bool rejected = false;
};

static git_remote_callbacks callbacks(RemoteContext &context) {
  git_remote_callbacks result = GIT_REMOTE_CALLBACKS_INIT;
  result.payload = &context;
  result.credentials = [](git_credential **out, const char *url, const char *, unsigned int types, void *payload) {
    const auto &context = *static_cast<RemoteContext *>(payload);
    if (!allowedRemote(url) || context.token.empty() || !(types & GIT_CREDENTIAL_USERPASS_PLAINTEXT)) return static_cast<int>(GIT_EAUTH);
    return git_credential_userpass_plaintext_new(out, "x-access-token", context.token.c_str());
  };
  result.certificate_check = [](git_cert *, int valid, const char *host, void *) {
    return valid && std::string(host) == "github.com" ? 0 : static_cast<int>(GIT_ECERTIFICATE);
  };
  result.push_negotiation = [](const git_push_update **updates, size_t count, void *payload) {
    auto &context = *static_cast<RemoteContext *>(payload);
    if (!context.force) return 0;
    for (size_t i = 0; i < count; i++) {
      const bool matches = context.expected.is_null() ? git_oid_is_zero(&updates[i]->src) != 0 : oidString(&updates[i]->src) == context.expected.get<std::string>();
      if (!matches) { context.leaseChanged = true; return static_cast<int>(GIT_EUSER); }
    }
    return 0;
  };
  result.push_update_reference = [](const char *, const char *status, void *payload) {
    if (status) static_cast<RemoteContext *>(payload)->rejected = true;
    return 0;
  };
  return result;
}

static void origin(Remote &remote, git_repository *repo) {
  checkGit(git_remote_lookup(remote.out(), repo, "origin"), "GIT_REMOTE_MISSING");
  const char *url = git_remote_url(remote.get());
  const char *pushUrl = git_remote_pushurl(remote.get());
  if (!url || !allowedRemote(url) || (pushUrl && !allowedRemote(pushUrl)))
    throw WorkspaceError("UNSUPPORTED_REMOTE", "Connect an HTTPS GitHub remote without embedded credentials.");
}

void cloneRepository(const fs::path &root, const Json &args) {
  const auto url = args.at("url").get<std::string>();
  if (!allowedRemote(url)) throw WorkspaceError("UNSUPPORTED_REMOTE", "Choose an HTTPS GitHub repository without embedded credentials.");
  RemoteContext context{args.value("accessToken", "")};
  git_clone_options options = GIT_CLONE_OPTIONS_INIT;
  options.fetch_opts.callbacks = callbacks(context);
  options.fetch_opts.follow_redirects = GIT_REMOTE_REDIRECT_NONE;
  Repository repo;
  checkGit(git_clone(repo.out(), url.c_str(), root.c_str(), &options), "CLONE_FAILED");
}

static void fetch(git_repository *repo, const Json &args) {
  Remote remote;
  origin(remote, repo);
  RemoteContext context{args.value("accessToken", "")};
  git_fetch_options options = GIT_FETCH_OPTIONS_INIT;
  options.callbacks = callbacks(context);
  options.follow_redirects = GIT_REMOTE_REDIRECT_NONE;
  options.prune = GIT_FETCH_PRUNE;
  char spec[] = "+refs/heads/*:refs/remotes/origin/*";
  char *values[] = {spec};
  git_strarray refspecs{values, 1};
  checkGit(git_remote_fetch(remote.get(), &refspecs, &options, "fetch: Codaloud"), "FETCH_FAILED");
}

static std::string trackingBranch(git_repository *repo) {
  const auto counts = gitCounts(repo);
  if (counts.at("currentBranch").is_null()) throw WorkspaceError("DETACHED_HEAD", "Check out a branch first.");
  if (counts.at("upstream").is_null()) return counts.at("currentBranch").get<std::string>();
  const auto upstream = counts.at("upstream").get<std::string>();
  if (upstream.rfind("origin/", 0) != 0) throw WorkspaceError("UNSUPPORTED_REMOTE", "The current branch tracks a remote other than origin.");
  return upstream.substr(7);
}

static Json push(git_repository *repo, const Json &args) {
  requireMutableBranch(repo);
  const auto counts = gitCounts(repo);
  if (counts.at("headSha").is_null()) throw WorkspaceError("UNBORN_HEAD", "Create a commit before pushing.");
  const auto branch = counts.at("currentBranch").get<std::string>();
  const auto remoteBranch = trackingBranch(repo);
  Remote remote;
  origin(remote, repo);
  RemoteContext context{args.value("accessToken", ""), args.value("force", false), args.value("expectedRemoteSha", Json(nullptr))};
  if (context.force && !args.contains("expectedRemoteSha")) throw WorkspaceError("PUSH_LEASE_REQUIRED", "Refresh the remote branch before force pushing.");
  if (context.force && !context.expected.is_null() && (!context.expected.is_string() ||
    !std::regex_match(context.expected.get<std::string>(), std::regex("[a-f0-9]{40}"))))
    throw WorkspaceError("PUSH_LEASE_REQUIRED", "Choose a valid observed remote commit.");
  auto spec = std::string(context.force ? "+" : "") + "refs/heads/" + branch + ":refs/heads/" + remoteBranch;
  char *values[] = {spec.data()};
  git_strarray refspecs{values, 1};
  git_push_options options = GIT_PUSH_OPTIONS_INIT;
  options.callbacks = callbacks(context);
  options.follow_redirects = GIT_REMOTE_REDIRECT_NONE;
  const auto status = git_remote_push(remote.get(), &refspecs, &options);
  if (context.leaseChanged) throw WorkspaceError("PUSH_LEASE_CHANGED", "The remote branch changed. Fetch and review it before force pushing.");
  if (context.rejected) throw WorkspaceError("PUSH_REJECTED", "GitHub rejected the update. Check branch protections and incoming commits.");
  checkGit(status, "PUSH_FAILED");
  bool trackingUpdated = false;
  Json freshCounts = nullptr;
  try {
    git_oid head;
    checkGit(git_oid_fromstr(&head, counts.at("headSha").get<std::string>().c_str()));
    Reference tracking, local;
    checkGit(git_reference_create(tracking.out(), repo, ("refs/remotes/origin/" + remoteBranch).c_str(), &head, 1, "push: Codaloud"));
    checkGit(git_branch_lookup(local.out(), repo, branch.c_str(), GIT_BRANCH_LOCAL));
    checkGit(git_branch_set_upstream(local.get(), ("origin/" + remoteBranch).c_str()));
    trackingUpdated = true;
    freshCounts = gitCounts(repo);
  } catch (...) {
    // The server has accepted the push. Report that result even if a local
    // tracking write fails, so the UI does not suggest repeating the push.
  }
  return {{"pushed", true}, {"remoteBranch", remoteBranch}, {"remoteSha", counts.at("headSha")},
    {"trackingUpdated", trackingUpdated}, {"counts", freshCounts}};
}

static git_oid mergeOrRebase(git_repository *repo, const git_oid &localId, const git_oid &remoteId, const Json &args) {
  Signature signature;
  createSignature(signature, args);
  if (args.value("rebase", false)) {
    AnnotatedCommit branch, upstream;
    checkGit(git_annotated_commit_lookup(branch.out(), repo, &localId));
    checkGit(git_annotated_commit_lookup(upstream.out(), repo, &remoteId));
    git_rebase_options options = GIT_REBASE_OPTIONS_INIT;
    options.inmemory = 1;
    Rebase rebase;
    checkGit(git_rebase_init(rebase.out(), repo, branch.get(), upstream.get(), nullptr, &options));
    git_oid last = remoteId;
    git_rebase_operation *operation;
    int status;
    while ((status = git_rebase_next(&operation, rebase.get())) != GIT_ITEROVER) {
      checkGit(status);
      Index index;
      checkGit(git_rebase_inmemory_index(index.out(), rebase.get()));
      if (git_index_has_conflicts(index.get())) throw WorkspaceError("PULL_CONFLICT", "The rebase has conflicts. Your branch and files were left unchanged.");
      git_oid next;
      const auto committed = git_rebase_commit(&next, rebase.get(), nullptr, signature.get(), nullptr, nullptr);
      if (committed != GIT_EAPPLIED) { checkGit(committed); last = next; }
    }
    checkGit(git_rebase_finish(rebase.get(), signature.get()));
    return last;
  }
  Commit local, remote;
  checkGit(git_commit_lookup(local.out(), repo, &localId));
  checkGit(git_commit_lookup(remote.out(), repo, &remoteId));
  Index index;
  checkGit(git_merge_commits(index.out(), repo, local.get(), remote.get(), nullptr));
  if (git_index_has_conflicts(index.get())) throw WorkspaceError("PULL_CONFLICT", "The merge has conflicts. Your branch and files were left unchanged.");
  git_oid treeId, commitId;
  checkGit(git_index_write_tree_to(&treeId, index.get(), repo));
  Tree tree;
  checkGit(git_tree_lookup(tree.out(), repo, &treeId));
  const git_commit *parents[] = {local.get(), remote.get()};
  const auto message = "Merge origin/" + trackingBranch(repo);
  checkGit(git_commit_create(&commitId, repo, nullptr, signature.get(), signature.get(), "UTF-8", message.c_str(), tree.get(), 2, parents));
  return commitId;
}

static Json pull(git_repository *repo, const Json &args) {
  requireMutableBranch(repo);
  if (hasChanges(repo)) throw WorkspaceError("DIRTY_WORKTREE", "Commit or stash local changes before pulling.");
  const auto previous = gitCounts(repo);
  if (previous.at("headSha").is_null()) throw WorkspaceError("UNBORN_HEAD", "Clone the remote repository before pulling its history.");
  fetch(repo, args);
  const auto branch = previous.at("currentBranch").get<std::string>();
  const auto remoteBranch = trackingBranch(repo);
  git_oid local, remote;
  checkGit(git_oid_fromstr(&local, previous.at("headSha").get<std::string>().c_str()));
  checkGit(git_reference_name_to_id(&remote, repo, ("refs/remotes/origin/" + remoteBranch).c_str()));
  size_t ahead, behind;
  checkGit(git_graph_ahead_behind(&ahead, &behind, repo, &local, &remote));
  git_oid next = local;
  bool rebased = false;
  if (behind > 0) {
    next = ahead == 0 ? remote : mergeOrRebase(repo, local, remote, args);
    rebased = ahead > 0 && args.value("rebase", false);
    checkoutAndUpdateHead(repo, &next, &local);
  }
  Reference current;
  checkGit(git_branch_lookup(current.out(), repo, branch.c_str(), GIT_BRANCH_LOCAL));
  checkGit(git_branch_set_upstream(current.get(), ("origin/" + remoteBranch).c_str()));
  return {{"previousHeadSha", oidString(&local)}, {"headSha", oidString(&next)}, {"currentBranch", branch},
    {"rebased", rebased}, {"counts", gitCounts(repo)}};
}

Json gitRemoteOperation(git_repository *repo, const std::string &operation, const Json &args) {
  if (operation == "git/fetch") { fetch(repo, args); return gitCounts(repo); }
  if (operation == "git/push") return push(repo, args);
  if (operation == "git/pull") return pull(repo, args);
  throw WorkspaceError("UNKNOWN_OPERATION", "Unknown local Git operation.");
}
}
