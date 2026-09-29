import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";

const quote = (path: string) => "'" + path.replace(/'/g, "'\\''") + "'";

export const runCommandForFile = (unsafePath: string) => {
  const path = projectFilePathSchema.parse(unsafePath);
  if (/\.(?:js|mjs|cjs|jsx)$/i.test(path)) return "node " + quote(path);
  if (/\.(?:ts|mts|cts|tsx)$/i.test(path))
    return "npx --yes tsx " + quote(path);
  if (/\.py$/i.test(path)) return "python3 " + quote(path);
  throw new Error("Run supports JavaScript, TypeScript, or Python files.");
};
