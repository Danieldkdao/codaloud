import { z } from "zod";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";

export const commandDestinations = [
  "files",
  "git",
  "agent",
  "terminal",
  "code",
  "back",
] as const;
export type CommandDestination = (typeof commandDestinations)[number];
export const commandNavigationSchema = z
  .strictObject({
    target: z.enum(commandDestinations),
    path: projectFilePathSchema.optional(),
    open: z.boolean().optional(),
  })
  .refine(
    (input) => input.path === undefined || input.target === "files",
    "Only Files accepts a folder path.",
  )
  .refine(
    (input) => input.open === undefined || input.target === "terminal",
    "Only the terminal supports open or close.",
  );
export type CommandNavigationSchema = z.infer<typeof commandNavigationSchema>;
export const commandOpenFileSchema = z.strictObject({
  path: projectFilePathSchema,
});
export type CommandOpenFileSchema = z.infer<typeof commandOpenFileSchema>;
let navigation:
  | ((
      projectId: string,
      input: CommandNavigationSchema | CommandOpenFileSchema,
    ) => Promise<void> | void)
  | undefined;
const terminalPanels = new Map<string, (open: boolean) => void>();
const filePanels = new Map<string, (path: string) => void>();
const readyListeners = new Set<() => void>();
export const waitForCommandProject = (projectId: string) => {
  if (terminalPanels.has(projectId) && filePanels.has(projectId))
    return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const ready = () => {
      if (!terminalPanels.has(projectId) || !filePanels.has(projectId)) return;
      clearTimeout(timer);
      readyListeners.delete(ready);
      resolve();
    };
    const timer = setTimeout(() => {
      readyListeners.delete(ready);
      reject(
        new Error(
          "Project is still opening. Try again when its editor is ready.",
        ),
      );
    }, 10000);
    readyListeners.add(ready);
  });
};
export const registerCommandNavigation = (
  handler: NonNullable<typeof navigation>,
) => {
  navigation = handler;
  return () => {
    if (navigation === handler) navigation = undefined;
  };
};
export const navigateCommand = async (
  projectId: string,
  input: CommandNavigationSchema | CommandOpenFileSchema,
) => {
  if (!navigation)
    throw new Error("Navigation is unavailable. Reopen the app.");
  await navigation(projectId, input);
};
export const registerCommandTerminal = (
  projectId: string,
  handler: (open: boolean) => void,
) => {
  terminalPanels.set(projectId, handler);
  for (const listener of readyListeners) listener();
  return () => {
    if (terminalPanels.get(projectId) === handler)
      terminalPanels.delete(projectId);
  };
};
export const setCommandTerminal = (projectId: string, open: boolean) => {
  const handler = terminalPanels.get(projectId);
  if (!handler)
    throw new Error("Open this project's editor before its terminal.");
  handler(open);
};
export const registerCommandFiles = (
  projectId: string,
  handler: (path: string) => void,
) => {
  filePanels.set(projectId, handler);
  for (const listener of readyListeners) listener();
  return () => {
    if (filePanels.get(projectId) === handler) filePanels.delete(projectId);
  };
};
export const openCommandFile = (projectId: string, path: string) => {
  const handler = filePanels.get(projectId);
  if (!handler) throw new Error("Open this project before opening a file.");
  handler(projectFilePathSchema.parse(path));
};
