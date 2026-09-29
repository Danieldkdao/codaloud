import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({
  Paths: { document: { uri: "file:///var/mobile/Documents/" } },
  File: class {},
  Directory: class {},
}));

import {
  imageFileExtensions,
  isProjectImagePath,
} from "../lib/image-files";
import { projectImageUri } from "../lib/project-image-uri";

const projectId = "00000000-0000-4000-8000-0000000000c1";
const workspace = `file:///var/mobile/Documents/codaloud-workspaces/${projectId}`;

describe("image path detection", () => {
  it.each(imageFileExtensions)("recognizes a .%s file", (extension) => {
    expect(isProjectImagePath(`assets/logo.${extension}`)).toBe(true);
  });

  it("ignores case and folder depth", () => {
    expect(isProjectImagePath("Images/Photo.JPG")).toBe(true);
    expect(isProjectImagePath("a/b/c/d/e/icon.PNG")).toBe(true);
  });

  it.each([
    "notes.ts",
    "archive.tar.gz",
    "Makefile",
    "README",
    "data.json",
    ".env",
    "styles.css",
    "video.mp4",
    "movie.webm",
    "sound.mp3",
    "app.pdf",
  ])("leaves %s to the text editor", (path) => {
    expect(isProjectImagePath(path)).toBe(false);
  });

  it("does not treat a leading dot as an extension", () => {
    expect(isProjectImagePath(".gitignore")).toBe(false);
    expect(isProjectImagePath("assets/.png")).toBe(false);
  });

  it("survives empty and malformed paths", () => {
    for (const path of ["", "/", "//", "folder/", "a/", "a..b"])
      expect(isProjectImagePath(path)).toBe(false);
  });
});

describe("image workspace uri", () => {
  it("points at the folder the native engine reads", () => {
    expect(projectImageUri(projectId, "assets/logo.png")).toBe(
      `${workspace}/assets/logo.png`,
    );
  });

  it("lowercases the project id it embeds", () => {
    expect(projectImageUri(projectId.toUpperCase(), "a.png")).toBe(
      `${workspace}/a.png`,
    );
  });

  it("percent-encodes names that a bare uri cannot carry", () => {
    expect(projectImageUri(projectId, "screens/my shot.png")).toBe(
      `${workspace}/screens/my%20shot.png`,
    );
    expect(projectImageUri(projectId, "café.png")).toBe(
      `${workspace}/caf%C3%A9.png`,
    );
  });

  it.each(["../outside.png", "/etc/passwd", "", "a/../b.png", ".git/config"])(
    "refuses to build a uri for %s",
    (path) => {
      expect(() => projectImageUri(projectId, path)).toThrow();
    },
  );

  it("refuses a project id that is not a uuid", () => {
    expect(() => projectImageUri("../elsewhere", "a.png")).toThrow();
  });
});
