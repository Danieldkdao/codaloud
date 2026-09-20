import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), delete: vi.fn(), uploadFiles: vi.fn(), run: vi.fn(), download: vi.fn(), details: vi.fn() }));
vi.mock("@daytona/sdk", () => ({ Daytona: class { create = mocks.create; delete = mocks.delete; } }));
import { executeTemporaryCode } from "../temporary-execution";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({ id: "temporary", getUserHomeDir: async () => "/home/daytona", fs: { uploadFiles: mocks.uploadFiles, downloadFile: mocks.download, getFileDetails: mocks.details, createFolder: vi.fn() }, process: { executeCommand: mocks.run } });
  mocks.run.mockResolvedValue({ exitCode: 0, result: "done" });
  mocks.download.mockResolvedValue(Buffer.from("result"));
  mocks.details.mockResolvedValue({ size: 6, isDir: false });
});
it("rejects oversized outputs before downloading and still cleans up", async () => {
  mocks.details.mockResolvedValue({ size: 51 * 1024 * 1024, isDir: false });
  await expect(executeTemporaryCode({ apiKey: "user-key", command: "node main.js", files: [], outputPaths: ["result.txt"] })).rejects.toThrow();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.delete).toHaveBeenCalledOnce();
});
it("uploads an explicit snapshot, collects requested output, and deletes the sandbox", async () => {
  const result = await executeTemporaryCode({ apiKey: "user-key", command: "node main.js", files: [{ path: "main.js", content: Buffer.from("console.log('done')") }], outputPaths: ["result.txt"] });
  expect(result).toMatchObject({ exitCode: 0, output: "done", files: [{ path: "result.txt" }] });
  expect(mocks.delete).toHaveBeenCalledOnce();
  expect(mocks.create.mock.calls[0][0]).toMatchObject({ ephemeral: true, autoStopInterval: 5, public: false });
});
it.each(["uploadFiles", "run", "download"] as const)("deletes the temporary sandbox after %s fails", async (step) => {
  mocks[step].mockRejectedValue(new Error("failure"));
  await expect(executeTemporaryCode({ apiKey: "user-key", command: "node main.js", files: [{ path: "main.js", content: Buffer.from("code") }], outputPaths: ["result.txt"] })).rejects.toThrow();
  expect(mocks.delete).toHaveBeenCalledOnce();
});
it("rejects unsafe snapshot paths before provisioning", async () => {
  await expect(executeTemporaryCode({ apiKey: "user-key", command: "node main.js", files: [{ path: "../secret", content: Buffer.from("data") }] })).rejects.toThrow();
  expect(mocks.create).not.toHaveBeenCalled();
});
