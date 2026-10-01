import { expect, it, vi } from "vitest";
import { loadEnvFile } from "node:process";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { encodeSyncDownload, decodeSyncDownload } from "../lib/sync-download";
import { syncDownloadBatchFiles, syncDownloadConcurrency } from "../constants";

// This opt-in Node test harness loads credentials without importing native env modules.
const enabled = process.env.CODALOUD_LIVE_SYNC_BENCHMARK === "1";
if (enabled) {
  try {
    loadEnvFile(".env.local");
  } catch {}
  try {
    loadEnvFile(".env");
  } catch {}
}
vi.mock("@/data/env/server", () => ({
  serverEnv: {
    DAYTONA_API_KEY: process.env.DAYTONA_API_KEY,
    DAYTONA_TARGET: process.env.DAYTONA_TARGET ?? "us",
  },
}));

it.skipIf(!enabled)(
  "measures production manifest and bounded download code against an isolated Daytona fixture",
  async () => {
    const { Daytona } =
      require("@daytona/sdk") as typeof import("@daytona/sdk");
    const { readSandboxManifest, downloadSandboxFiles } =
      await import("../server/sandbox");
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      target: process.env.DAYTONA_TARGET ?? "us",
      requestTimeoutMs: 60000,
    });
    const sandbox = await daytona.create(
      {
        language: "typescript",
        ephemeral: true,
        autoStopInterval: 5,
        labels: { purpose: "codaloud-sync-benchmark" },
      },
      { timeout: 120 },
    );
    const root = "/tmp/codaloud-sync-benchmark";
    const memoryStart = process.memoryUsage();
    let peakRss = memoryStart.rss,
      peakHeap = memoryStart.heapUsed,
      peakExternal = memoryStart.external;
    const sampler = setInterval(() => {
      const value = process.memoryUsage();
      peakRss = Math.max(peakRss, value.rss);
      peakHeap = Math.max(peakHeap, value.heapUsed);
      peakExternal = Math.max(peakExternal, value.external);
    }, 20);
    try {
      const script = `const fs=require('fs');fs.mkdirSync('${root}',{recursive:true});for(let i=0;i<640;i++){const p='${root}/file-'+i+'.txt';fs.writeFileSync(p,Buffer.alloc(4096,i%256))}`;
      const setup = await sandbox.process.executeCommand(
        `node -e '${script.replaceAll("'", "'\\''")}'`,
        undefined,
        undefined,
        60,
      );
      expect(setup.exitCode).toBe(0);
      const metrics: Record<string, unknown>[] = [];
      const coldStart = performance.now();
      const manifest = await readSandboxManifest(sandbox, root, [], (value) =>
        metrics.push(value),
      );
      const coldMs = performance.now() - coldStart;
      const warmStart = performance.now();
      expect(
        await readSandboxManifest(sandbox, root, [], (value) =>
          metrics.push(value),
        ),
      ).toEqual(manifest);
      const warmMs = performance.now() - warmStart;
      expect(metrics[1]).toMatchObject({
        hashed: 0,
        reused: 640,
        bytesHashed: 0,
      });
      const paths = Object.keys(manifest);
      let offset = 0,
        active = 0,
        peakRequests = 0,
        batches = 0,
        transferredBytes = 0;
      const start = performance.now();
      await Promise.all(
        Array.from({ length: syncDownloadConcurrency }, async () => {
          while (offset < paths.length) {
            const batch = paths.slice(offset, offset + syncDownloadBatchFiles);
            offset += syncDownloadBatchFiles;
            peakRequests = Math.max(peakRequests, ++active);
            const files = await downloadSandboxFiles(sandbox, root, batch);
            const wire = encodeSyncDownload(files);
            transferredBytes += wire.byteLength;
            const decoded = decodeSyncDownload(wire, batch);
            for (const file of decoded) {
              expect("bytes" in file).toBe(true);
              if ("bytes" in file)
                expect(
                  createHash("sha256").update(file.bytes).digest("hex"),
                ).toBe(manifest[file.path]);
            }
            active--;
            batches++;
          }
        }),
      );
      const downloadMs = performance.now() - start;
      expect(batches).toBe(Math.ceil(paths.length / syncDownloadBatchFiles));
      expect(peakRequests).toBe(syncDownloadConcurrency);
      await sandbox.process.executeCommand(
        `node -e 'require("fs").writeFileSync("${root}/file-0.txt",Buffer.alloc(4096,1))'`,
      );
      await readSandboxManifest(sandbox, root, [], (value) =>
        metrics.push(value),
      );
      expect(metrics[2]).toMatchObject({
        hashed: 1,
        reused: 639,
        bytesHashed: 4096,
      });
      const report = {
        measuredAt: new Date().toISOString(),
        fixture: { files: 640, bytes: 640 * 4096 },
        coldMs,
        warmMs,
        downloadMs,
        batches,
        peakRequests,
        transferredBytes,
        manifestMetrics: metrics,
        memory: {
          baselineRssMiB: memoryStart.rss / 1048576,
          peakRssMiB: peakRss / 1048576,
          peakHeapMiB: peakHeap / 1048576,
          peakExternalMiB: peakExternal / 1048576,
        },
        note: "Direct Daytona requests; excludes mobile filesystem and development tunnel. Fixture is deleted in finally.",
      };
      writeFileSync(
        "docs/research/sync-benchmark.json",
        JSON.stringify(report, null, 2) + "\n",
      );
      console.info(JSON.stringify(report));
    } finally {
      clearInterval(sampler);
      await daytona.delete(sandbox);
    }
  },
  240000,
);
