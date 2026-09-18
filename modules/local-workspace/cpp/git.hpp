#pragma once
#include "workspace.hpp"
#include <git2.h>

namespace codaloud {
template<typename T, void (*Free)(T *)> struct GitHandle {
  T *value = nullptr;
  ~GitHandle() { if (value) Free(value); }
  GitHandle() = default;
  GitHandle(const GitHandle &) = delete;
  GitHandle &operator=(const GitHandle &) = delete;
  T **out() { return &value; }
  T *get() const { return value; }
};
using Repository = GitHandle<git_repository, git_repository_free>;
using Reference = GitHandle<git_reference, git_reference_free>;
using Commit = GitHandle<git_commit, git_commit_free>;
using Tree = GitHandle<git_tree, git_tree_free>;
using Index = GitHandle<git_index, git_index_free>;
using Signature = GitHandle<git_signature, git_signature_free>;
using Diff = GitHandle<git_diff, git_diff_free>;
using Patch = GitHandle<git_patch, git_patch_free>;
using StatusList = GitHandle<git_status_list, git_status_list_free>;
using BranchIterator = GitHandle<git_branch_iterator, git_branch_iterator_free>;
using Revwalk = GitHandle<git_revwalk, git_revwalk_free>;
using Object = GitHandle<git_object, git_object_free>;

void checkGit(int result, const std::string &code = "GIT_OPERATION_FAILED");
void initializeGit(const fs::path &root);
void openRepository(Repository &repo, const fs::path &root);
std::string oidString(const git_oid *oid);
Json currentBranch(git_repository *repo);
Json gitCounts(git_repository *repo);
void requireMutableBranch(git_repository *repo);
void createSignature(Signature &signature, const Json &args);
Json gitOperation(const fs::path &root, const std::string &operation, const Json &args);
Json gitReadOperation(git_repository *repo, const std::string &operation, const Json &args);
Json gitMutation(git_repository *repo, const std::string &operation, const Json &args);
bool hasChanges(git_repository *repo);
void cloneRepository(const fs::path &root, const Json &args);
Json gitRemoteOperation(git_repository *repo, const std::string &operation, const Json &args);
void checkoutAndUpdateHead(git_repository *repo, const git_oid *next, const git_oid *expected);
Json gitChanges(git_repository *repo);
Json commitMetadata(git_commit *commit, bool detailed = false);
Json diffPatch(git_diff *diff, size_t index);
std::string fileMode(uint32_t mode);
std::string deltaState(git_delta_t status);
}
