import ts from "./generated/compiler";
import libraries from "./generated/libraries.json";
import type { CodeIntelligenceRequestSchema, CodeIntelligenceResultSchema } from "@/features/projects/actions/code-intelligence-schemas";
import type { DiagnosticCategory, ScriptElementKind } from "typescript";

const formatSeverity = (category: DiagnosticCategory) => {
  switch (category) {
    case ts.DiagnosticCategory.Error: return "error" as const;
    case ts.DiagnosticCategory.Warning: return "warning" as const;
    default: return "info" as const;
  }
};
const formatCompletionKind = (kind: ScriptElementKind) => {
  switch (kind) {
    case ts.ScriptElementKind.functionElement: case ts.ScriptElementKind.memberFunctionElement: return "function";
    case ts.ScriptElementKind.memberVariableElement: return "property";
    case ts.ScriptElementKind.classElement: return "class";
    case ts.ScriptElementKind.interfaceElement: case ts.ScriptElementKind.typeElement: return "type";
    case ts.ScriptElementKind.constElement: return "constant";
    case ts.ScriptElementKind.keyword: return "keyword";
    default: return "variable";
  }
};
const normalize = (path: string) => {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
};

export const analyzeTypeScript = async (
  input: CodeIntelligenceRequestSchema, readFile: (path: string) => Promise<string | null>,
): Promise<CodeIntelligenceResultSchema> => {
  const target = `/workspace/${input.path}`;
  const files = new Map<string, string | null>([[target, input.content]]);
  const pending = new Set<string>();
  let bytes = input.content.length;
  const read = (path: string): string | undefined => {
    const key = normalize(path);
    if (key.startsWith("/lib/")) return (libraries as Record<string, string>)[key];
    if (!key.startsWith("/workspace/") || key.split("/").includes(".git")) return undefined;
    if (!files.has(key)) pending.add(key);
    return files.get(key) ?? undefined;
  };
  // TypeScript's synchronous host discovers missing imports/configuration. Load
  // those files asynchronously through the native boundary, then retry the host.
  // No project code, plugins, or package installation scripts are executed.
  for (let pass = 0; pass < 32; pass++) {
    pending.clear();
    const hostFiles = {
      useCaseSensitiveFileNames: true,
      readFile: read, fileExists: (path: string) => read(path) !== undefined,
      readDirectory: () => [target],
    };
    const configPath = ts.findConfigFile(target.slice(0, target.lastIndexOf("/")), hostFiles.fileExists, "tsconfig.json")
      ?? ts.findConfigFile("/workspace", hostFiles.fileExists, "jsconfig.json");
    const config = configPath ? ts.readConfigFile(configPath, read) : null;
    if (config?.error) throw new Error("Unable to parse the local TypeScript configuration.");
    const parsed = configPath ? ts.parseJsonConfigFileContent(config!.config, hostFiles, configPath.slice(0, configPath.lastIndexOf("/")), undefined, configPath) : null;
    const options = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
      strict: true, allowJs: true, checkJs: true, allowImportingTsExtensions: true,
      ...parsed?.options, noEmit: true };
    const service = ts.createLanguageService({
      ...hostFiles, useCaseSensitiveFileNames: () => true,
      getCompilationSettings: () => options, getScriptFileNames: () => [target],
      getScriptVersion: () => "0", getCurrentDirectory: () => "/workspace",
      getDefaultLibFileName: () => "/lib/lib.esnext.full.d.ts",
      getScriptSnapshot: (path) => { const content = read(path); return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content); },
    });
    let result: CodeIntelligenceResultSchema;
    try {
      if (input.position !== undefined) {
        const completion = service.getCompletionsAtPosition(target, input.position, { includeCompletionsForModuleExports: false, includeCompletionsWithInsertText: true, includeCompletionsWithSnippetText: false });
        result = { completions: (completion?.entries ?? []).filter((entry) => !entry.hasAction && !entry.isSnippet).map((entry) => {
          const span = entry.replacementSpan ?? completion?.optionalReplacementSpan;
          return { label: entry.name, type: formatCompletionKind(entry.kind), apply: entry.insertText ?? entry.name,
            ...(span ? { from: span.start, to: span.start + span.length } : {}) };
        }) };
      } else {
        result = { diagnostics: [...service.getSyntacticDiagnostics(target), ...service.getSemanticDiagnostics(target), ...service.getSuggestionDiagnostics(target)]
          .filter((item) => item.file?.fileName === target && item.start !== undefined)
          .map((item) => ({ from: item.start!, to: item.start! + (item.length ?? 0), severity: formatSeverity(item.category), code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, "\n") })) };
      }
    } finally { service.dispose(); }
    if (!pending.size) return result;
    if (files.size + pending.size > 4096) throw new Error("This file needs more dependencies than the on-device analysis limit.");
    for (const path of pending) {
      const content = await readFile(path.slice("/workspace/".length));
      bytes += content?.length ?? 0;
      if (bytes > 64 * 1024 * 1024) throw new Error("This file exceeds the on-device analysis memory limit.");
      files.set(path, content);
    }
  }
  throw new Error("The local dependency graph could not be resolved within the analysis limit.");
};
