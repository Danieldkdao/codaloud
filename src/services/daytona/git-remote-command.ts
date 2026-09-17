import { sandboxGitOriginRuntime } from "./git-origin-command";

// Authenticated Git runs only in a newly initialized bare repository. Workspace
// configuration never receives the credential, even during object transfer.
export const sandboxGitRemoteRuntime = sandboxGitOriginRuntime + String.raw`
  const prepareRemote = () => {
    if (!input.remote || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(input.remote.cloneUrl)) fail("GIT_REMOTE_REQUIRED");
    reconcileGitOrigin(input.remote.cloneUrl, input.remote.repositoryId, "GIT_REMOTE_MISMATCH");
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "codaloud-git-remote-"));
    git(["init", "--bare", "--template=", temporary], temporary);
  };
  const network = (args) => git(["-c", "protocol.https.allow=always", "-c", "http.followRedirects=false", "-c", "http.sslVerify=true", ...args], temporary, {
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraHeader",
    GIT_CONFIG_VALUE_0: "Authorization: Basic " + Buffer.from("x-access-token:" + input.remote.accessToken).toString("base64"),
  });
  const fetchRemote = () => {
    try { network(["fetch", "--atomic", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", input.remote.cloneUrl, "+refs/heads/*:refs/heads/*"]); }
    catch { fail("GIT_REMOTE_FAILED"); }
    checkExpected();
    mutationStarted = true;
    const shallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
    git(["-c", "protocol.file.allow=always", "fetch", "--atomic", "--prune", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head",
      ...(shallow ? ["--unshallow"] : []), temporary, "+refs/heads/*:refs/remotes/origin/*"]);
    checkExpected();
  };
  const resolveRemoteBranch = (currentBranch, allowFirstPush = false) => {
    const remotes = optional(["config", "--get-all", "branch." + currentBranch + ".remote"])?.split("\n") ?? [];
    const merges = optional(["config", "--get-all", "branch." + currentBranch + ".merge"])?.split("\n") ?? [];
    if (!remotes.length && !merges.length) {
      if (!allowFirstPush) fail("GIT_UPSTREAM_REQUIRED");
      return currentBranch;
    }
    // Respect a differently named upstream, but never guess between remotes or
    // multiple merge refs. This project synchronizes only its trusted origin.
    if (remotes.length !== 1 || remotes[0] !== "origin" || merges.length !== 1 || !merges[0].startsWith("refs/heads/")) fail("GIT_UPSTREAM_REQUIRED");
    const name = merges[0].slice("refs/heads/".length);
    try { git(["check-ref-format", "--branch", name]); }
    catch { fail("GIT_UPSTREAM_REQUIRED"); }
    return name;
  };
`;
