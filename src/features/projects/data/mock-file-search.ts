import type { ProjectFileSearchDocument } from "@/features/projects/types";

// Fixed preview fixtures: these are never read from or written to the sandbox.
export const mockProjectSearchFiles: ProjectFileSearchDocument[] = [
  {
    path: "src/features/projects/components/project-files-list.tsx",
    content: "export const ProjectFilesList = () => {\n  const project = useProject();\n  return project.files.map(renderFile);\n};",
  },
  {
    path: "src/features/projects/components/project-card.tsx",
    content: "export const Card = ({ name, description }) => (\n  <View>\n    <Text>{name}</Text>\n    <Text>{description}</Text>\n  </View>\n);",
  },
  {
    path: "docs/workspace-guide.md",
    content: "# Workspace guide\n\n" + Array.from({ length: 12 }, (_, index) =>
      `${index + 1}. Open the project workspace and review the saved files.`).join("\n"),
  },
  {
    path: "src/lib/auth.ts",
    content: "export const auth = createAuth({\n  providers: ['github', 'apple'],\n});\n\nexport const getSession = () => auth.getSession();",
  },
  {
    path: "src/features/settings/components/account.tsx",
    content: "const session = useAuthSession();\nconst name = session.user.name;\n// Refresh auth before opening account settings.",
  },
  {
    path: "src/hooks/use-theme.tsx",
    content: "export const useTheme = () => {\n  const theme = useColorScheme();\n  return theme;\n};",
  },
  {
    path: "src/global.css",
    content: "/* Theme tokens */\n:root {\n  --background: var(--theme-background);\n  --foreground: var(--theme-foreground);\n  --primary: var(--theme-primary);\n}\n/* Switch the theme from Settings. */",
  },
  {
    path: "src/features/projects/components/project-search.tsx",
    content: "const search = useSearch();\nconst results = search.files;\n// Search by title, content, or both.\nreturn <Results files={results} />;",
  },
  {
    path: "src/features/projects/tests/project-search.test.tsx",
    content: "it('finds files', () => {\n  expect(search('project')).toHaveLength(3);\n});",
  },
  {
    path: "README.md",
    content: "# Codaloud\n\nA mobile code workspace.\nOpen a project, search your files, and keep coding.\nConnect GitHub from your account settings.",
  },
];
