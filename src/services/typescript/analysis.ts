import ts from "./generated/compiler";
import libraries from "./generated/libraries.json";
import type {
  CodeIntelligenceRequestSchema,
  CodeIntelligenceResultSchema,
} from "@/features/projects/actions/code-intelligence-schemas";
import type {
  CompilerHost,
  CompilerOptions,
  DiagnosticCategory,
  IScriptSnapshot,
  LanguageService,
  LanguageServiceHost,
  ScriptElementKind,
} from "typescript";

const formatSeverity = (category: DiagnosticCategory) => {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return "error" as const;
    case ts.DiagnosticCategory.Warning:
      return "warning" as const;
    default:
      return "info" as const;
  }
};
const formatCompletionKind = (kind: ScriptElementKind) => {
  switch (kind) {
    case ts.ScriptElementKind.scriptElement: return "file";
    case ts.ScriptElementKind.directory: return "namespace";
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.memberFunctionElement:
      return "function";
    case ts.ScriptElementKind.memberVariableElement:
      return "property";
    case ts.ScriptElementKind.classElement:
      return "class";
    case ts.ScriptElementKind.interfaceElement:
    case ts.ScriptElementKind.typeElement:
      return "type";
    case ts.ScriptElementKind.constElement:
      return "constant";
    case ts.ScriptElementKind.keyword:
      return "keyword";
    default:
      return "variable";
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

export const createTypeScriptAnalyzer = (
  readFile: (path: string) => Promise<string | null>,
  listDirectory: (path: string) => Promise<{ path: string; isDir: boolean }[]> = async () => [],
) => {
  const directories = new Map<string, { path: string; isDir: boolean }[]>();
  const pendingDirectories = new Set<string>();
  const files = new Map<string, string | null>();
  const versions = new Map<string, number>();
  const snapshots = new Map<string, IScriptSnapshot>();
  const pending = new Set<string>();
  let target = "";
  let bytes = 0;
  let revision = 0;
  let dependencyValidationTime = 0;
  let invalidatedResolutions = false;
  let options: CompilerOptions = {};
  let service: LanguageService | undefined;
  let queued = Promise.resolve();
  let closed = false;
  let completionGeneration = 0;
  const resetGraph = () => {
    dependencyValidationTime = 0;
    files.clear();
    directories.clear();
    pendingDirectories.clear();
    versions.clear();
    for (const path of snapshots.keys()) {
      if (!path.startsWith("/lib/")) snapshots.delete(path);
    }
    pending.clear();
    bytes = 0;
    target = "";
    invalidatedResolutions = true;
    revision++;
  };
  const reset = () => {
    service?.dispose();
    service = undefined;
    resetGraph();
    snapshots.clear();
  };
  const update = (path: string, content: string | null) => {
    if (files.has(path) && files.get(path) === content) return;
    bytes += (content?.length ?? 0) - (files.get(path)?.length ?? 0);
    if (bytes > 64 * 1024 * 1024)
      throw new Error("This file exceeds the on-device analysis memory limit.");
    if (!files.has(path) && files.size >= 4096)
      throw new Error(
        "This file needs more dependencies than the on-device analysis limit.",
      );
    // Newly available/deleted modules and changed package metadata invalidate
    // TypeScript's resolution cache even when the importing text is unchanged.
    if (
      (files.get(path) != null) !== (content !== null) ||
      path.endsWith(".json")
    )
      invalidatedResolutions = true;
    files.set(path, content);
    versions.set(path, ++revision);
    snapshots.delete(path);
  };
  const read = (path: string): string | undefined => {
    const key = normalize(path);
    if (key.startsWith("/lib/"))
      return (libraries as Record<string, string>)[key];
    if (!key.startsWith("/workspace/") || key.split("/").includes(".git"))
      return undefined;
    if (!files.has(key)) pending.add(key);
    return files.get(key) ?? undefined;
  };
  const directoryEntries = (path: string) => {
    const key = normalize(path);
    if ((key !== "/workspace" && !key.startsWith("/workspace/")) || key.split("/").includes(".git")) return [];
    if (!directories.has(key)) pendingDirectories.add(key);
    return directories.get(key) ?? [];
  };
  const hostFiles = {
    useCaseSensitiveFileNames: true,
    readFile: read,
    fileExists: (path: string) => read(path) !== undefined,
    readDirectory: (path: string, extensions?: readonly string[]) => directoryEntries(path)
      .filter((entry) => !entry.isDir && (!extensions || extensions.some((extension) => entry.path.endsWith(extension))))
      .map((entry) => normalize(`/workspace/${entry.path}`)),
    getDirectories: (path: string) => directoryEntries(path).filter((entry) => entry.isDir).map((entry) => normalize(`/workspace/${entry.path}`)),
  };
  const run = async (
    input: CodeIntelligenceRequestSchema,
  ): Promise<CodeIntelligenceResultSchema> => {
    const nextTarget = normalize(`/workspace/${input.path}`);
    // Bound project files to the active graph, but retain the compiler and its
    // immutable standard libraries so every tab does not pay a cold parse cost.
    if (target !== nextTarget) resetGraph();
    target = nextTarget;
    update(target, input.content);
    // The editor buffer wins over the saved copy. Revalidate dependencies and
    // failed lookups so saves, Git operations, and new files cannot go stale.
    // Typing can reuse a graph validated within the last 250 ms. Diagnostics
    // and code transformations always refresh it, including failed lookups.
    if (
      input.position === undefined ||
      Date.now() - dependencyValidationTime >= 250
    ) {
      for (const path of files.keys()) {
        if (path !== target)
          update(path, await readFile(path.slice("/workspace/".length)));
      }
      directories.clear();
      dependencyValidationTime = Date.now();
    }
    // The synchronous compiler discovers imports; load them through the native
    // boundary and retry. Project code and package scripts are never executed.
    for (let pass = 0; pass < 32; pass++) {
      pending.clear();
      pendingDirectories.clear();
      const configPath =
        ts.findConfigFile(
          target.slice(0, target.lastIndexOf("/")),
          hostFiles.fileExists,
          "tsconfig.json",
        ) ??
        ts.findConfigFile("/workspace", hostFiles.fileExists, "jsconfig.json");
      const config = configPath ? ts.readConfigFile(configPath, read) : null;
      if (config?.error)
        throw new Error("Unable to parse the local TypeScript configuration.");
      const parsed = configPath
        ? ts.parseJsonConfigFileContent(
            config!.config,
            hostFiles,
            configPath.slice(0, configPath.lastIndexOf("/")),
            undefined,
            configPath,
          )
        : null;
      options = {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        strict: true,
        allowJs: true,
        checkJs: true,
        allowImportingTsExtensions: true,
        ...parsed?.options,
        noEmit: true,
      };
      const host = {
        ...hostFiles,
        // TypeScript 6 also reads this compiler-host hook from its language
        // service host. Preserve parsed libraries while re-resolving imports.
        hasInvalidatedResolutions: () => invalidatedResolutions,
        useCaseSensitiveFileNames: () => true,
        getCompilationSettings: () => options,
        getScriptFileNames: () => [target],
        getProjectVersion: () => String(revision),
        getScriptVersion: (path) => String(versions.get(normalize(path)) ?? 0),
        getCurrentDirectory: () => "/workspace",
        getDefaultLibFileName: () => "/lib/lib.esnext.full.d.ts",
        getScriptSnapshot: (path) => {
          const key = normalize(path);
          const content = read(key);
          if (content === undefined) return undefined;
          let snapshot = snapshots.get(key);
          if (!snapshot) {
            snapshot = ts.ScriptSnapshot.fromString(content);
            snapshots.set(key, snapshot);
          }
          return snapshot;
        },
      } satisfies LanguageServiceHost &
        Pick<CompilerHost, "hasInvalidatedResolutions">;
      service ??= ts.createLanguageService(host);
      let result: CodeIntelligenceResultSchema;
      if (input.operation) {
        const formatOptions = {
          indentSize: input.tabSize ?? 2,
          tabSize: input.tabSize ?? 2,
          convertTabsToSpaces: !input.useTabs,
          newLineCharacter: input.content.includes("\r\n") ? "\r\n" : "\n",
          insertSpaceAfterCommaDelimiter: true,
          insertSpaceBeforeAndAfterBinaryOperators: true,
          insertSpaceAfterKeywordsInControlFlowStatements: true,
          insertSpaceBeforeFunctionParenthesis: false,
          insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
        };
        const edits =
          input.operation === "format"
            ? service.getFormattingEditsForDocument(target, formatOptions)
            : service
                .organizeImports(
                  { type: "file", fileName: target },
                  formatOptions,
                  {},
                )
                .filter((file) => file.fileName === target)
                .flatMap((file) => file.textChanges);
        result = {
          edits: edits.map((edit) => ({
            from: edit.span.start,
            to: edit.span.start + edit.span.length,
            insert: edit.newText,
          })),
        };
      } else if (input.position !== undefined) {
        const completion = service.getCompletionsAtPosition(
          target,
          input.position,
          {
            includeCompletionsForModuleExports: false,
            includeCompletionsWithInsertText: true,
            includeCompletionsWithSnippetText: false,
          },
        );
        result = {
          completions: (completion?.entries ?? [])
            .filter((entry) => !entry.hasAction && !entry.isSnippet)
            .map((entry) => {
              const span =
                entry.replacementSpan ?? completion?.optionalReplacementSpan;
              return {
                label: entry.name,
                type: formatCompletionKind(entry.kind),
                apply: entry.insertText ?? entry.name,
                ...(span
                  ? { from: span.start, to: span.start + span.length }
                  : {}),
              };
            }),
        };
      } else {
        result = {
          diagnostics: [
            ...service.getSyntacticDiagnostics(target),
            ...service.getSemanticDiagnostics(target),
            ...service.getSuggestionDiagnostics(target),
          ]
            .filter(
              (item) =>
                item.file?.fileName === target && item.start !== undefined,
            )
            .map((item) => ({
              from: item.start!,
              to: item.start! + (item.length ?? 0),
              severity: formatSeverity(item.category),
              code: item.code,
              message: ts.flattenDiagnosticMessageText(item.messageText, "\n"),
            })),
        };
      }
      invalidatedResolutions = false;
      if (!pending.size && !pendingDirectories.size) {
        if (input.position === undefined) dependencyValidationTime = Date.now();
        return result;
      }
      if (files.size + pending.size > 4096)
        throw new Error(
          "This file needs more dependencies than the on-device analysis limit.",
        );
      for (const path of pendingDirectories) {
        if (directories.size >= 512) throw new Error("This file needs too many directories for local completion.");
        directories.set(path, await listDirectory(path.slice("/workspace".length).replace(/^\//, "")));
        revision++;
        invalidatedResolutions = true;
      }
      for (const path of pending) {
        update(path, await readFile(path.slice("/workspace/".length)));
      }
    }
    throw new Error(
      "The local dependency graph could not be resolved within the analysis limit.",
    );
  };
  return {
    analyze: (input: CodeIntelligenceRequestSchema) => {
      if (closed)
        return Promise.reject(new Error("The analysis session is closed."));
      const completion =
        input.position === undefined ? undefined : ++completionGeneration;
      const result = queued
        .then(
          ():
            | Promise<CodeIntelligenceResultSchema>
            | CodeIntelligenceResultSchema => {
            // A slow compiler must not accumulate obsolete keystrokes in its queue.
            if (completion !== undefined && completion !== completionGeneration)
              return { completions: [] };
            return run(input);
          },
        )
        .catch((error: unknown) => {
          reset();
          throw error;
        });
      queued = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    dispose: () => {
      closed = true;
      return queued.then(reset);
    },
  };
};

export const analyzeTypeScript = async (
  input: CodeIntelligenceRequestSchema,
  readFile: (path: string) => Promise<string | null>,
): Promise<CodeIntelligenceResultSchema> => {
  const analyzer = createTypeScriptAnalyzer(readFile);
  try {
    return await analyzer.analyze(input);
  } finally {
    await analyzer.dispose();
  }
};
