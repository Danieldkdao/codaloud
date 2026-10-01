import { expect, it, vi } from "vitest";
import { createCommandNavigator } from "../command-navigator";
import {
  registerCommandFiles,
  registerCommandTerminal,
} from "../command-navigation";

it("opens supporting routes and returns to the editor for files and terminal", async () => {
  const router = {
    navigate: vi.fn(),
    dismissTo: vi.fn(),
    back: vi.fn(),
    canGoBack: () => true,
  };
  const openFile = vi.fn();
  const terminal = vi.fn();
  const releaseFile = registerCommandFiles("p", openFile);
  const releaseTerminal = registerCommandTerminal("p", terminal);
  const navigate = createCommandNavigator(router, () => "p");
  await navigate("p", { target: "files" });
  expect(router.navigate).toHaveBeenCalledWith({
    pathname: "/projects/[projectId]/files",
    params: { projectId: "p" },
  });
  await navigate("p", { path: "src/app.ts" });
  expect(openFile).toHaveBeenCalledWith("src/app.ts");
  expect(router.dismissTo).toHaveBeenCalledWith({
    pathname: "/projects/[projectId]/code",
    params: { projectId: "p" },
  });
  await navigate("p", { target: "terminal" });
  expect(terminal).toHaveBeenCalledWith(true);
  releaseFile();
  releaseTerminal();
});

it("rejects commands outside a resource and never lets back leave the current project", async () => {
  const router = {
    navigate: vi.fn(),
    dismissTo: vi.fn(),
    back: vi.fn(),
    canGoBack: () => true,
  };
  const navigate = createCommandNavigator(router, () => "p");
  await expect(navigate("app", { target: "git" })).rejects.toThrow(/project/i);
  await expect(navigate("draft:one", { target: "files" })).rejects.toThrow(
    /project/i,
  );
  await navigate("p", { target: "back" });
  expect(router.back).not.toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith({
    pathname: "/projects/[projectId]/code",
    params: { projectId: "p" },
  });
  await expect(
    navigate("p", { target: "git", projectId: "other" } as never),
  ).rejects.toThrow(/current project/i);
  await expect(navigate("p", { target: "settings" } as never)).rejects.toThrow(
    /inside/i,
  );
  expect(router.navigate).not.toHaveBeenCalled();
});

it("opens folder results in Files and rejects a delayed action after leaving the project", async () => {
  let active: string | undefined = "p";
  const router = {
    navigate: vi.fn(),
    dismissTo: vi.fn(),
    back: vi.fn(),
    canGoBack: () => true,
  };
  const navigate = createCommandNavigator(router, () => active);
  await navigate("p", { target: "files", path: "src/lib" } as never);
  expect(router.navigate).toHaveBeenCalledWith({
    pathname: "/projects/[projectId]/files",
    params: { projectId: "p", path: "src/lib" },
  });
  active = undefined;
  await expect(navigate("p", { target: "files" })).rejects.toThrow(
    /current project/i,
  );
  expect(router.navigate).toHaveBeenCalledTimes(1);
});
