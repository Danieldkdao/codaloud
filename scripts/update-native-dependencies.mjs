import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const resolveDependencyRelease = (dependency, release) => {
  const version = release.tag_name?.replace(/^(?:v|mbedtls-)/, "");
  if (
    release.draft ||
    release.prerelease ||
    !/^\d+\.\d+\.\d+$/.test(version ?? "")
  ) {
    throw new Error(`${dependency.name}: expected a stable release.`);
  }
  if (version.split(".")[0] !== dependency.version.split(".")[0]) {
    throw new Error(
      `${dependency.name}: latest is ${version}, a new major version. Review native API compatibility before updating its lock entry.`,
    );
  }
  const tag = encodeURIComponent(release.tag_name);
  switch (dependency.name) {
    case "libgit2":
      return {
        version,
        url: `https://api.github.com/repos/${dependency.repository}/tarball/${tag}`,
      };
    case "nlohmann":
      return {
        version,
        url: `https://raw.githubusercontent.com/${dependency.repository}/${tag}/single_include/nlohmann/json.hpp`,
      };
    case "mbedtls": {
      // GitHub-generated snapshots can omit the bundled dependencies required by CMake.
      const asset = release.assets?.find(
        (item) => item.name === `mbedtls-${version}.tar.bz2`,
      );
      if (
        !asset ||
        !asset.browser_download_url?.startsWith(
          `https://github.com/${dependency.repository}/releases/download/`,
        )
      ) {
        throw new Error("Mbed TLS release archive is unavailable.");
      }
      return { version, url: asset.browser_download_url, digest: asset.digest };
    }
    default:
      throw new Error(`Unknown native dependency: ${dependency.name}`);
  }
};

const fetchChecked = async (url) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { "User-Agent": "codaloud-native-dependencies" },
  });
  if (!response.ok)
    throw new Error(`Unable to download ${url}: ${response.status}`);
  return response;
};

const update = async () => {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--write" && arg !== "--check"))
    throw new Error("Use --check (default) or --write.");
  const manifest = new URL("./native-dependencies.json", import.meta.url);
  const dependencies = JSON.parse(await readFile(manifest, "utf8"));
  const updated = [];
  for (const dependency of dependencies) {
    const release = await (
      await fetchChecked(
        `https://api.github.com/repos/${dependency.repository}/releases/latest`,
      )
    ).json();
    let next;
    try {
      next = resolveDependencyRelease(dependency, release);
    } catch (error) {
      if (args.includes("--write")) throw error;
      console.log(error.message);
      continue;
    }
    console.log(`${dependency.name}: ${dependency.version} → ${next.version}`);
    if (!args.includes("--write") || next.version === dependency.version) {
      updated.push(dependency);
      continue;
    }
    const bytes = Buffer.from(
      await (await fetchChecked(next.url)).arrayBuffer(),
    );
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (next.digest && next.digest !== `sha256:${sha256}`)
      throw new Error(`${dependency.name}: publisher checksum mismatch.`);
    updated.push({
      ...dependency,
      version: next.version,
      url: next.url,
      sha256,
    });
  }
  if (args.includes("--write")) {
    // Publish all updates together; a failed lookup/download leaves the lock intact.
    const temporary = new URL(
      "./native-dependencies.json.tmp",
      import.meta.url,
    );
    await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`);
    await rename(temporary, manifest);
    console.log(
      "Lock updated. Run pnpm prepare:native, rebuild both platforms, and run tests before committing.",
    );
  }
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await update();
}
