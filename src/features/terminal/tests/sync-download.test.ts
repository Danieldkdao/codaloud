import { expect, it } from "vitest";
import { decodeSyncDownload, encodeSyncDownload } from "../lib/sync-download";
import { maxSyncDownloadBatchBytes } from "../constants";

it("round-trips binary, empty files, errors and individual-download markers", () => {
  const files = [
    { path: "a.bin", bytes: new Uint8Array([0, 255, 10]) },
    { path: "empty.txt", bytes: new Uint8Array() },
    { path: "bad.txt", error: "File disappeared" },
    { path: "large.bin", individual: true as const },
    { path: "overflow.bin", individual: true as const, fileSize: 256 * 1024 },
  ];
  const bytes = encodeSyncDownload(files);
  expect(
    decodeSyncDownload(
      bytes,
      files.map((file) => file.path),
    ),
  ).toEqual(files);
  const padded = new Uint8Array(bytes.length + 10);
  padded.set(bytes, 5);
  expect(
    decodeSyncDownload(
      padded.subarray(5, 5 + bytes.length),
      files.map((file) => file.path),
    ),
  ).toEqual(files);
});

it("rejects oversized batches before allocating the transfer buffer", () => {
  expect(() =>
    encodeSyncDownload([
      { path: "big.bin", bytes: new Uint8Array(maxSyncDownloadBatchBytes + 1) },
    ]),
  ).toThrow("size limit");
});

it("rejects truncated, trailing, duplicate and unexpected data", () => {
  const bytes = encodeSyncDownload([
    { path: "a.txt", bytes: new Uint8Array([1]) },
  ]);
  expect(() => decodeSyncDownload(bytes.slice(0, -1), ["a.txt"])).toThrow(
    "Incomplete",
  );
  const extra = new Uint8Array(bytes.length + 1);
  extra.set(bytes);
  expect(() => decodeSyncDownload(extra, ["a.txt"])).toThrow("Unexpected");
  expect(() => decodeSyncDownload(bytes, ["different.txt"])).toThrow("paths");
  expect(() =>
    decodeSyncDownload(
      encodeSyncDownload([
        { path: "a.txt", bytes: new Uint8Array() },
        { path: "a.txt", bytes: new Uint8Array() },
      ]),
      ["a.txt", "a.txt"],
    ),
  ).toThrow("paths");
});
