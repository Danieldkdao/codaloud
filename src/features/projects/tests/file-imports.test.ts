import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * expo-file-system is replaced with an in-memory tree so uploads can be
 * exercised without a device: `file:///…` URIs are keys and a trailing slash
 * marks a directory.
 */
const fake = vi.hoisted(() => {
  const state = {
    entries: new Set<string>(),
    sizes: new Map<string, number>(),
    copyFailures: new Set<string>(),
    pickFiles: null as null | (() => Promise<unknown>),
    pickDirectory: null as null | (() => Promise<unknown>),
  };

  const lastName = (uri: string) =>
    uri.replace(/\/$/, "").split("/").filter(Boolean).at(-1) ?? "";

  class Directory {
    static pickDirectoryAsync = () => {
      if (!state.pickDirectory) throw new Error("No directory pick staged.");
      return state.pickDirectory();
    };
    uri: string;
    constructor(...uris: (string | { uri: string })[]) {
      const [head, ...rest] = uris;
      const base = typeof head === "string" ? head.replace(/\/$/, "") : head.uri;
      this.uri = [base, ...rest.map(String)].join("/");
    }
    get name() {
      return lastName(this.uri);
    }
    get exists() {
      return state.entries.has(`${this.uri}/`);
    }
    create(options?: { intermediates?: boolean; idempotent?: boolean }) {
      if (state.entries.has(`${this.uri}/`)) {
        if (options?.idempotent) return;
        throw new Error("The destination already exists.");
      }
      const segments = this.uri.split("/");
      const ancestors: string[] = [];
      for (let index = 3; index < segments.length; index += 1)
        ancestors.push(`${segments.slice(0, index).join("/")}/`);
      if (!options?.intermediates) {
        const parent = ancestors.at(-2);
        if (parent && !state.entries.has(parent))
          throw new Error("The containing folder doesn't exist.");
      }
      for (const ancestor of ancestors) state.entries.add(ancestor);
    }
    list() {
      const prefix = `${this.uri}/`;
      return [...state.entries]
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => entry.slice(prefix.length))
        .filter(
          (relative) => relative !== "" && !relative.replace(/\/$/, "").includes("/"),
        )
        .map((relative) =>
          relative.endsWith("/")
            ? new Directory(prefix + relative)
            : new File(prefix + relative),
        );
    }
  }

  class File {
    static pickFileAsync = () => {
      if (!state.pickFiles) throw new Error("No file pick staged.");
      return state.pickFiles();
    };
    uri: string;
    constructor(...uris: (string | { uri: string })[]) {
      const [head, ...rest] = uris;
      const base = typeof head === "string" ? head.replace(/\/$/, "") : head.uri;
      this.uri = [base, ...rest.map(String)].join("/");
    }
    get name() {
      return lastName(this.uri);
    }
    get size() {
      return state.sizes.get(this.uri) ?? 0;
    }
    get exists() {
      return state.entries.has(this.uri);
    }
    get parentDirectory() {
      return new Directory(this.uri.split("/").slice(0, -1).join("/"));
    }
    async copy(destination: { uri: string }, options?: { overwrite?: boolean }) {
      if (!this.exists)
        throw new Error("The picked file is no longer available on this device.");
      if (state.copyFailures.has(this.uri)) throw new Error("Out of storage.");
      if (!options?.overwrite && state.entries.has(destination.uri))
        throw new Error("The destination already exists.");
      state.entries.add(destination.uri);
      state.sizes.set(destination.uri, this.size);
    }
  }

  return {
    state,
    File,
    Directory,
    Paths: {
      get document() {
        return new Directory("file:///var/mobile/Documents/");
      },
    },
  };
});

vi.mock("expo-file-system", () => fake as never);

import {
  collectProjectImportItems,
  copyProjectImportItems,
  pickProjectFiles,
  pickProjectFolder,
  planProjectImport,
} from "../lib/file-imports";
import {
  joinProjectPath,
  projectPathSegments,
  projectWorkspaceDirectory,
  projectWorkspaceFile,
  requireProjectWorkspace,
} from "../lib/workspace-paths";

const projectId = "00000000-0000-4000-8000-0000000000f1";
const root = `file:///var/mobile/Documents/codaloud-workspaces/${projectId}`;
const pick = "file:///var/mobile/Documents/DocumentPicker/my-app";

/** Seeds a `relative path: size` map as files, creating every parent folder. */
const seed = (prefix: string, files: Record<string, number>) => {
  fake.state.entries.add(`${prefix}/`);
  for (const [relative, size] of Object.entries(files)) {
    const segments = relative.split("/");
    for (let index = 1; index < segments.length; index += 1)
      fake.state.entries.add(`${prefix}/${segments.slice(0, index).join("/")}/`);
    const uri = `${prefix}/${relative}`;
    fake.state.entries.add(uri);
    fake.state.sizes.set(uri, size);
  }
};

const source = (relative: string) => new fake.File(`${pick}/${relative}`) as never;
const folder = (uri = pick) => new fake.Directory(uri) as never;
const entry = (relativePath: string, size = 1) => ({
  relativePath,
  name: relativePath.split("/").at(-1)!,
  uri: `${pick}/${relativePath}`,
  size,
});

beforeEach(() => {
  fake.state.entries = new Set([`${root}/`]);
  fake.state.sizes = new Map();
  fake.state.copyFailures = new Set();
  fake.state.pickFiles = null;
  fake.state.pickDirectory = null;
});

describe("workspace path mapping", () => {
  it("maps a project-relative path onto the engine's own folder", () => {
    expect(projectWorkspaceDirectory(projectId).uri).toBe(root);
    expect(projectWorkspaceFile(projectId, "src/a.ts").uri).toBe(`${root}/src/a.ts`);
    expect(projectWorkspaceFile(projectId, "a.ts").uri).toBe(`${root}/a.ts`);
  });

  it("lowercases the project id it uses as the folder name", () => {
    expect(projectWorkspaceDirectory(projectId.toUpperCase()).uri).toBe(root);
  });

  it.each(["../escape.ts", "/etc/passwd", ".git/config", "src/../secret", "a//b"])(
    "refuses the unsafe project path %s",
    (path) => {
      expect(() => projectPathSegments(path)).toThrow();
      expect(() => projectWorkspaceFile(projectId, path)).toThrow();
    },
  );

  it("refuses a project id that is not a uuid", () => {
    expect(() => projectWorkspaceDirectory("two/three")).toThrow();
  });

  it("reports a workspace the engine has not created", () => {
    expect(() => requireProjectWorkspace(projectId)).not.toThrow();
    fake.state.entries = new Set();
    expect(() => requireProjectWorkspace(projectId)).toThrow(/not available/i);
  });

  it("joins destination folders without double slashes", () => {
    expect(joinProjectPath("", "a.ts")).toBe("a.ts");
    expect(joinProjectPath("src", "a.ts")).toBe("src/a.ts");
  });
});

describe("collecting a picked selection", () => {
  beforeEach(() => {
    seed(pick, {
      "README.md": 4,
      "src/index.ts": 9,
      "src/nested/deep.ts": 11,
      ".git/config": 20,
      ".github/workflows/ci.yml": 3,
    });
  });

  it("flattens a picked folder into project-relative items", () => {
    expect(
      collectProjectImportItems(folder())
        .map((collected) => collected.relativePath)
        .sort(),
    ).toEqual([
      ".github/workflows/ci.yml",
      "README.md",
      "src/index.ts",
      "src/nested/deep.ts",
    ]);
  });

  it("carries each source uri and byte size through the plan", () => {
    const collected = collectProjectImportItems(folder()).find(
      (candidate) => candidate.relativePath === "src/index.ts",
    );
    expect(collected).toMatchObject({ uri: `${pick}/src/index.ts`, size: 9 });
  });

  it("never imports the .git folder the engine already owns", () => {
    const paths = collectProjectImportItems(folder()).map(
      (collected) => collected.relativePath,
    );
    expect(paths.filter((path) => path === ".git" || path.startsWith(".git/"))).toEqual([]);
  });

  it("drops names the workspace engine would refuse", () => {
    fake.state.entries.add(`${pick}/bad${String.fromCharCode(0)}name.ts`);
    const paths = collectProjectImportItems(folder()).map(
      (collected) => collected.relativePath,
    );
    expect(paths.some((path) => path.includes("bad"))).toBe(false);
  });

  it("accepts a single picked file as one item", () => {
    seed("file:///tmp", { "one.png": 7 });
    expect(
      collectProjectImportItems(new fake.File("file:///tmp/one.png") as never),
    ).toEqual([
      { relativePath: "one.png", name: "one.png", uri: "file:///tmp/one.png", size: 7 },
    ]);
  });

  it("refuses a file above the per-file limit", () => {
    seed(pick, { "huge.bin": 32 * 1024 * 1024 + 1 });
    expect(() => collectProjectImportItems(folder())).toThrow(/larger than 32 MB/);
  });

  it("refuses a selection above the total byte budget", () => {
    const chunk = 20 * 1024 * 1024;
    seed(
      pick,
      Object.fromEntries(
        Array.from({ length: 14 }, (_unused, index) => [`f${index}.bin`, chunk]),
      ),
    );
    expect(() => collectProjectImportItems(folder())).toThrow(/larger than 256 MB/);
  });

  it("refuses a folder nested deeper than the import limit", () => {
    const deep = Array.from({ length: 20 }, (_unused, index) => `d${index}`).join("/");
    seed(pick, { [`${deep}/leaf.ts`]: 1 });
    expect(() => collectProjectImportItems(folder())).toThrow(/nested too deeply/);
  });

  it("refuses a folder with more files than one upload may hold", () => {
    const many: Record<string, number> = {};
    for (let index = 0; index <= 2000; index += 1) many[`f${index}.ts`] = 1;
    seed(pick, many);
    expect(() => collectProjectImportItems(folder())).toThrow(/at most 2000 files/);
  });
});

describe("pickers", () => {
  it("returns items for the files the user chose", async () => {
    seed("file:///tmp", { "a.ts": 1, "b.ts": 2 });
    fake.state.pickFiles = async () => ({
      canceled: false,
      result: [new fake.File("file:///tmp/a.ts"), new fake.File("file:///tmp/b.ts")],
    });
    await expect(pickProjectFiles()).resolves.toMatchObject([
      { relativePath: "a.ts", size: 1 },
      { relativePath: "b.ts", size: 2 },
    ]);
  });

  it("returns null when the file picker is dismissed", async () => {
    fake.state.pickFiles = async () => ({ canceled: true, result: null });
    await expect(pickProjectFiles()).resolves.toBeNull();
  });

  it("maps a dismissed folder picker to null", async () => {
    fake.state.pickDirectory = async () => {
      throw new Error("File picking was cancelled by the user");
    };
    await expect(pickProjectFolder()).resolves.toBeNull();
  });

  it("rethrows a real folder picker failure instead of hiding it", async () => {
    fake.state.pickDirectory = async () => {
      throw new Error("No view controller available for presenting file picker");
    };
    await expect(pickProjectFolder()).rejects.toThrow(/view controller/i);
  });

  it("walks a folder the picker returned", async () => {
    seed(pick, { "src/app.ts": 3 });
    fake.state.pickDirectory = async () => new fake.Directory(pick);
    await expect(pickProjectFolder()).resolves.toMatchObject([
      { relativePath: "src/app.ts", size: 3 },
    ]);
  });
});

describe("import collision planning", () => {
  const items = [
    entry("a.ts"),
    entry("src/b.ts"),
    entry("a.ts"),
  ];

  it("lists every clash and writes nothing else when the mode is fail", () => {
    const plan = planProjectImport(items, ["a.ts"], "fail");
    expect(plan.conflicts).toEqual(["a.ts", "a.ts"]);
    expect(plan.write.map((written) => written.relativePath)).toEqual(["src/b.ts"]);
    expect(plan.replaced).toEqual([]);
  });

  it("replaces only the clashing paths", () => {
    const plan = planProjectImport(items, ["src/b.ts"], "replace");
    expect(plan.write.map((written) => written.relativePath)).toEqual([
      "a.ts",
      "src/b.ts",
      "a.ts",
    ]);
    expect(plan.replaced).toEqual(["src/b.ts", "a.ts"]);
    expect(plan.conflicts).toEqual([]);
  });

  it("skips clashing paths and keeps the rest", () => {
    const plan = planProjectImport(items, ["a.ts"], "skip");
    expect(plan.write.map((written) => written.relativePath)).toEqual(["src/b.ts"]);
    expect(plan.skipped).toEqual(["a.ts", "a.ts"]);
  });

  it("qualifies collisions against the chosen destination folder", () => {
    const plan = planProjectImport([entry("a.ts")], ["src/a.ts"], "fail", "src");
    expect(plan.conflicts).toEqual(["src/a.ts"]);
  });

  it("treats a duplicate inside one selection as a collision", () => {
    const plan = planProjectImport([entry("solo.ts"), entry("solo.ts")], [], "fail");
    expect(plan.conflicts).toEqual(["solo.ts"]);
  });

  it("rejects an unknown mode instead of guessing", () => {
    expect(() => planProjectImport(items, [], "overwrite" as never)).toThrow(
      /Unsupported import mode/,
    );
  });
});

describe("copying uploads into a project", () => {
  it("creates missing parent folders and copies each file", async () => {
    seed(pick, { "src/app.ts": 5, "assets/logo.png": 6 });
    const copied = await copyProjectImportItems({
      projectId,
      directoryPath: "uploaded",
      items: [entry("src/app.ts", 5), entry("assets/logo.png", 6)],
      overwrite: false,
    });
    expect(copied).toMatchObject({
      imported: ["uploaded/src/app.ts", "uploaded/assets/logo.png"],
      failed: [],
      canceled: false,
    });
    expect(fake.state.entries.has(`${root}/uploaded/src/app.ts`)).toBe(true);
  });

  it("keeps going when one file cannot be copied", async () => {
    seed(pick, { "good.ts": 1, "bad.ts": 1 });
    fake.state.copyFailures.add(`${pick}/bad.ts`);
    const copied = await copyProjectImportItems({
      projectId,
      directoryPath: "",
      items: [entry("good.ts"), entry("bad.ts")],
      overwrite: false,
    });
    expect(copied.imported).toEqual(["good.ts"]);
    expect(copied.failed).toEqual([{ path: "bad.ts", reason: "Out of storage." }]);
  });

  it("refuses to overwrite a destination unless asked", async () => {
    seed(pick, { "a.ts": 1 });
    fake.state.entries.add(`${root}/a.ts`);
    const blocked = await copyProjectImportItems({
      projectId,
      directoryPath: "",
      items: [entry("a.ts")],
      overwrite: false,
    });
    expect(blocked.failed[0]?.reason).toMatch(/already exists/);

    const allowed = await copyProjectImportItems({
      projectId,
      directoryPath: "",
      items: [entry("a.ts")],
      overwrite: true,
    });
    expect(allowed.imported).toEqual(["a.ts"]);
  });

  it("stops at an abort and reports what already landed", async () => {
    seed(pick, { "a.ts": 1, "b.ts": 1 });
    const controller = new AbortController();
    controller.abort();
    const copied = await copyProjectImportItems({
      projectId,
      directoryPath: "",
      items: [entry("a.ts"), entry("b.ts")],
      overwrite: false,
      signal: controller.signal,
    });
    expect(copied).toEqual({ imported: [], failed: [], canceled: true });
  });

  it("refuses a source that disappeared after picking", async () => {
    const copied = await copyProjectImportItems({
      projectId,
      directoryPath: "",
      items: [entry("gone.ts")],
      overwrite: false,
    });
    expect(copied.imported).toEqual([]);
    expect(copied.failed[0]?.reason).toMatch(/no longer available/i);
  });
});
