import { expect, it } from "vitest";
import { resolveDependencyRelease } from "../scripts/update-native-dependencies.mjs";

it("resolves a stable JSON header release while preserving its exact tag", () => {
  expect(resolveDependencyRelease({ name: "nlohmann", version: "3.12.0", repository: "nlohmann/json" }, { tag_name: "v3.13.0", assets: [] }))
    .toMatchObject({ version: "3.13.0", url: "https://raw.githubusercontent.com/nlohmann/json/v3.13.0/single_include/nlohmann/json.hpp" });
});

it("refuses prereleases and unreviewed major-version changes", () => {
  const dependency = { name: "libgit2", version: "1.9.7", repository: "libgit2/libgit2" };
  expect(() => resolveDependencyRelease(dependency, { tag_name: "v1.10.0", prerelease: true })).toThrow("stable");
  expect(() => resolveDependencyRelease(dependency, { tag_name: "v2.0.0" })).toThrow("major");
});

it("requires the complete Mbed TLS release archive rather than a source snapshot", () => {
  const dependency = { name: "mbedtls", version: "3.6.7", repository: "Mbed-TLS/mbedtls" };
  expect(() => resolveDependencyRelease(dependency, { tag_name: "mbedtls-3.6.8", assets: [] })).toThrow("archive");
  expect(resolveDependencyRelease(dependency, { tag_name: "mbedtls-3.6.8", assets: [{ name: "mbedtls-3.6.8.tar.bz2", browser_download_url: "https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-3.6.8/mbedtls-3.6.8.tar.bz2" }] })).toMatchObject({ version: "3.6.8" });
});
