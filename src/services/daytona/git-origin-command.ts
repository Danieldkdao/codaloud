// Shared by authenticated Git operations and remote-branch checkout. Call only
// with the canonical URL resolved server-side from the connected repository ID.
export const sandboxGitOriginRuntime = String.raw`
  const reconcileGitOrigin = (cloneUrl, repositoryId, mismatchCode) => {
    let origin;
    try { origin = git(["config", "--local", "--get-all", "remote.origin.url"]).trim(); }
    catch { fail(mismatchCode); }
    if (!origin) fail(mismatchCode);
    if (origin.replace(/\.git$/, "").toLowerCase() === cloneUrl.replace(/\.git$/, "").toLowerCase()) return;

    // Names and owners can change. The import marker binds this workspace to
    // the stable ID already re-authorized by GitHub for the current user.
    let marker;
    try {
      const markerPath = path.join(input.repositoryPath, ".git", "codaloud-import.json");
      if (!fs.lstatSync(markerPath).isFile()) fail(mismatchCode);
      marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    } catch { fail(mismatchCode); }
    if (!repositoryId || marker?.repositoryId !== repositoryId) fail(mismatchCode);
    if (!fs.lstatSync(path.join(input.repositoryPath, ".git", "config")).isFile()) fail(mismatchCode);

    // Persist only the credential-free canonical URL, never follow the old URL.
    git(["config", "--local", "--replace-all", "remote.origin.url", cloneUrl]);
  };
`;
