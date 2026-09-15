// Authenticated Git runs only in a newly initialized bare repository. Workspace
// configuration never receives the credential, even during object transfer.
export const sandboxGitRemoteRuntime = String.raw`
  const prepareRemote = () => {
    if (!input.remote || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(input.remote.cloneUrl)) fail("GIT_REMOTE_REQUIRED");
    const origin = optional(["config", "--get", "remote.origin.url"]);
    if (!origin || origin.replace(/\.git$/, "").toLowerCase() !== input.remote.cloneUrl.replace(/\.git$/, "").toLowerCase()) fail("GIT_REMOTE_MISMATCH");
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
  const remoteBranch = () => {
    const configuredRemote = optional(["config", "--get", "branch." + input.expectedBranch + ".remote"]);
    const configuredMerge = optional(["config", "--get", "branch." + input.expectedBranch + ".merge"]);
    if ((configuredRemote && configuredRemote !== "origin") || (configuredMerge && configuredMerge !== "refs/heads/" + input.remoteBranch)) fail("GIT_UPSTREAM_REQUIRED");
    git(["check-ref-format", "--branch", input.remoteBranch]);
    return "refs/heads/" + input.remoteBranch;
  };
`;
