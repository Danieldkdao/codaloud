import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../modules/local-workspace",
);
// CocoaPods only includes resource paths within its ios podspec source root.
await mkdir(join(root, "ios/licenses"), { recursive: true });
await copyFile(
  join(root, "licenses/third-party-notices.txt"),
  join(root, "ios/licenses/third-party-notices.txt"),
);
const dependencies = JSON.parse(await readFile(new URL("./native-dependencies.json", import.meta.url), "utf8"));

await mkdir(join(root, "vendor"), { recursive: true });
for (const dependency of dependencies) {
  const destination = join(root, "vendor", dependency.name);
  const stamp = `${dependency.version}:${dependency.sha256}`;
  if (
    (await readFile(join(destination, ".verified"), "utf8").catch(() => "")) ===
    stamp
  )
    continue;
  const temporary = await mkdtemp(
    join(tmpdir(), "codaloud-native-dependency-"),
  );
  try {
    const response = await fetch(dependency.url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(
        `Unable to download ${dependency.name}: ${response.status}`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      createHash("sha256").update(bytes).digest("hex") !== dependency.sha256
    ) {
      throw new Error(
        `Checksum mismatch for ${dependency.name}; refusing the download.`,
      );
    }
    const staging = join(temporary, "source");
    await mkdir(staging);
    if (dependency.archive) {
      const archive = join(temporary, "source.tar.gz");
      await writeFile(archive, bytes);
      execFileSync("tar", [
        "-xf",
        archive,
        "--strip-components=1",
        "-C",
        staging,
      ]);
    } else {
      await writeFile(join(staging, "json.hpp"), bytes);
    }
    await writeFile(join(staging, ".verified"), stamp);
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    console.log(`Prepared ${dependency.name} ${dependency.version}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
