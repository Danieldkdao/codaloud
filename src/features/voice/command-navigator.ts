import type { Href, router as expoRouter } from "expo-router";
import {
  openCommandFile,
  commandDestinations,
  setCommandTerminal,
  waitForCommandProject,
  type CommandNavigationSchema,
  type CommandOpenFileSchema,
} from "./command-navigation";

export const createCommandNavigator =
  (
    router: Pick<
      typeof expoRouter,
      "navigate" | "dismissTo" | "canGoBack" | "back"
    >,
    getCurrentProject: () => string | undefined,
  ) =>
  async (
    currentProject: string,
    input: CommandNavigationSchema | CommandOpenFileSchema,
  ) => {
    const checkCurrent = () => {
      if (
        !currentProject ||
        currentProject === "app" ||
        currentProject.startsWith("draft:")
      )
        throw new Error("Open a project before using its panels.");
      if (getCurrentProject() !== currentProject)
        throw new Error("Commands stay in the current project.");
    };
    checkCurrent();
    if (
      "projectId" in input &&
      input.projectId &&
      input.projectId !== currentProject
    )
      throw new Error("Commands stay in the current project.");
    if ("target" in input && !commandDestinations.includes(input.target))
      throw new Error(
        "Commands control panels inside the current project only.",
      );
    const projectId = currentProject;
    const code = {
      pathname: "/projects/[projectId]/code",
      params: { projectId },
    } as const;
    if (!("target" in input) || input.target === "terminal") {
      router.dismissTo(code);
      await waitForCommandProject(projectId);
      checkCurrent();
      if (!("target" in input)) openCommandFile(projectId, input.path);
      else setCommandTerminal(projectId, input.open ?? true);
    } else if (input.target === "code" || input.target === "back")
      router.dismissTo(code);
    else
      router.navigate({
        pathname: `/projects/[projectId]/${input.target}`,
        params: { projectId, ...(input.path ? { path: input.path } : {}) },
      } as Href);
  };
