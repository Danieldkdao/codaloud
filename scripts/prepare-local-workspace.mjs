import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../modules/local-workspace");
const dependencies = [
  {
    name: "libgit2", version: "1.9.7", archive: true,
    url: "https://api.github.com/repos/libgit2/libgit2/tarball/v1.9.7",
    sha256: "f0b6d303fb659bd5a9d5343bb2c7795a21f5cb29ae7336ccfdb980921af07162",
  },
  {
    name: "nlohmann", version: "3.12.0", archive: false,
    url: "https://raw.githubusercontent.com/nlohmann/json/v3.12.0/single_include/nlohmann/json.hpp",
    sha256: "aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63",
  },
  {
    name: "mbedtls", version: "3.6.7", archive: true,
    url: "https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-3.6.7/mbedtls-3.6.7.tar.bz2",
    sha256: "a7e8bcbec0e6f761b4af24f25677626b35f762f68eef79c08677a363212d11f6",
  },
];

await mkdir(join(root, "vendor"), { recursive: true });
for (const dependency of dependencies) {
  const destination = join(root, "vendor", dependency.name);
  const stamp = `${dependency.version}:${dependency.sha256}`;
  if (await readFile(join(destination, ".verified"), "utf8").catch(() => "") === stamp) continue;
  const temporary = await mkdtemp(join(tmpdir(), "codaloud-native-dependency-"));
  try {
    const response = await fetch(dependency.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Unable to download ${dependency.name}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== dependency.sha256) {
      throw new Error(`Checksum mismatch for ${dependency.name}; refusing the download.`);
    }
    const staging = join(temporary, "source");
    await mkdir(staging);
    if (dependency.archive) {
      const archive = join(temporary, "source.tar.gz");
      await writeFile(archive, bytes);
      execFileSync("tar", ["-xf", archive, "--strip-components=1", "-C", staging]);
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
