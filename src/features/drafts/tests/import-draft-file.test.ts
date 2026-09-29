import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  picked: { canceled: false as boolean, result: { uri: "file:///picked/a.ts", name: "a.ts", size: 9 } as { uri: string; name: string; size: number } | null },
  text: "let a = 1",
  copy: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));

vi.mock("expo-file-system", () => {
  class FakeFile {
    static pickFileAsync = async () => mocks.picked;
    uri: string;
    name: string;
    size: number;
    exists = true;
    parentDirectory = { create: vi.fn(async () => undefined) };
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => typeof part === "string" ? part : part.uri).join("/");
      this.name = this.uri.split("/").at(-1) ?? "";
      this.size = mocks.picked.result?.size ?? 0;
    }
    text = async () => mocks.text;
    copy = mocks.copy;
    delete = mocks.remove;
  }
  return { File: FakeFile, Directory: class {}, Paths: { document: { uri: "file:///documents" } } };
});
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-0000000000aa" }));
vi.mock("../actions/draft-actions", () => ({
  createDraftAction: mocks.create,
}));

import { importDraftFileAction } from "../actions/import-draft-file";

beforeEach(() => {
  mocks.picked = { canceled: false, result: { uri: "file:///picked/a.ts", name: "a.ts", size: 9 } };
  mocks.text = "let a = 1";
  mocks.copy.mockReset();
  mocks.remove.mockReset();
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({ error: false, data: { id: "00000000-0000-4000-8000-0000000000aa" } });
});

describe("draft file import", () => {
  it("imports a small text file into the editable draft contents", async () => {
    await expect(importDraftFileAction()).resolves.toMatchObject({ error: false });
    expect(mocks.create).toHaveBeenCalledWith({ filename: "a.ts", content: "let a = 1" });
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it("retains an image in the app's document directory", async () => {
    mocks.picked.result = { uri: "file:///picked/diagram.png", name: "diagram.png", size: 20 };
    await expect(importDraftFileAction()).resolves.toMatchObject({ error: false });
    expect(mocks.create).toHaveBeenCalledWith(
      { filename: "diagram.png", content: "" },
      "00000000-0000-4000-8000-0000000000aa",
    );
    expect(mocks.copy).toHaveBeenCalledOnce();
  });

  it("does not create a draft when the picker is dismissed", async () => {
    mocks.picked.canceled = true;
    mocks.picked.result = null;
    await expect(importDraftFileAction()).resolves.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects invalid file names before writing", async () => {
    mocks.picked.result = { uri: "file:///picked/../bad.png", name: "../bad.png", size: 1 };
    await expect(importDraftFileAction()).resolves.toMatchObject({ error: true });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it("removes an image asset when the database write fails", async () => {
    mocks.picked.result = { uri: "file:///picked/diagram.png", name: "diagram.png", size: 20 };
    mocks.create.mockResolvedValue({ error: true, message: "Database busy" });
    await expect(importDraftFileAction()).resolves.toMatchObject({ error: true, message: "Database busy" });
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("removes a partial asset when the device copy fails", async () => {
    mocks.picked.result = { uri: "file:///picked/diagram.png", name: "diagram.png", size: 20 };
    mocks.copy.mockRejectedValue(new Error("Copy failed"));
    await expect(importDraftFileAction()).resolves.toMatchObject({ error: true, message: "Copy failed" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
});
