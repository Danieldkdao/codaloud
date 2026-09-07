import { describe, expect, it } from "vitest";

import { createProjectFormSchema } from "@/features/projects/actions/schemas";

describe("project form validation", () => {
  it("accepts a new project without a repository", () => {
    expect(createProjectFormSchema.parse({ name: " My project ", source: "new" }))
      .toEqual({ name: "My project", source: "new" });
  });

  it("rejects a repository on a new project", () => {
    expect(createProjectFormSchema.safeParse({
      name: "My project", source: "new", repositoryId: "123",
    }).success).toBe(false);
  });

  it("accepts a GitHub import with a repository", () => {
    expect(createProjectFormSchema.parse({
      name: "My project", source: "github", repositoryId: "123",
    })).toEqual({ name: "My project", source: "github", repositoryId: "123" });
  });

  it.each([undefined, null, "", " ", "abc", "0", "-1", "1.5"])(
    "requires a valid repository selection for GitHub imports (%s)",
    (repositoryId) => {
      const result = createProjectFormSchema.safeParse({
        name: "My project", source: "github", repositoryId,
      });
      expect(result.error?.issues).toContainEqual(expect.objectContaining({
        path: ["repositoryId"], message: "Select a GitHub repository.",
      }));
    },
  );

  it.each([undefined, "invalid"])("provides a source error for %s", (source) => {
    const result = createProjectFormSchema.safeParse({ name: "My project", source });
    expect(result.error?.issues).toContainEqual(expect.objectContaining({
      path: ["source"], message: "Choose how to start your project.",
    }));
  });

  it.each(["new", "github"])("keeps name validation for %s", (source) => {
    const result = createProjectFormSchema.safeParse({
      name: " ", source, ...(source === "github" ? { repositoryId: "123" } : {}),
    });
    expect(result.error?.issues).toContainEqual(expect.objectContaining({
      path: ["name"], message: "Project name is required.",
    }));
  });
});
