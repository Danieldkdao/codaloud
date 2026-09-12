import { createSandboxCommand, sandboxCommandInput } from "./create-command";
import type { CodeIntelligenceRequestSchema } from "@/features/projects/actions/code-intelligence-schemas";

// This program runs in Daytona. Compiler dependencies and source files never
// execute on the Expo server or the phone. Each request has its own unsaved overlay.
export const typescriptCommand = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
${sandboxCommandInput}
try {
  const root = path.join(input.home, ".codaloud", "workspace");
  if ([path.join(input.home, ".codaloud"), root].some((folder) => fs.lstatSync(folder).isSymbolicLink())) throw new Error("INVALID_PATH");
  const parts = input.path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\\\x00-\x1f\x7f]/.test(part))) throw new Error("INVALID_PATH");
  let target = root;
  for (const part of parts) {
    target = path.join(target, part);
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error("INVALID_PATH");
  }
  if (!fs.statSync(target).isFile() || !fs.realpathSync(target).startsWith(fs.realpathSync(root) + path.sep)) throw new Error("INVALID_PATH");
  let compiler;
  try { compiler = require.resolve("typescript", { paths: [path.dirname(target), root] }); }
  catch {
    // A separate pinned tool installation also supports new, empty workspaces.
    // Never install into or change the user's package.json / lockfile.
    const tools = path.join(input.home, ".codaloud", "editor-tools");
    try { compiler = require.resolve("typescript", { paths: [tools] }); }
    catch {
      execFileSync("npm", ["install", "--prefix", tools, "--ignore-scripts", "--no-audit", "--no-fund", "typescript@6.0.3"], { timeout: 45000, stdio: "pipe" });
      compiler = require.resolve("typescript", { paths: [tools] });
    }
  }
  const ts = require(compiler);
  const configPath = ts.findConfigFile(path.dirname(target), ts.sys.fileExists, "tsconfig.json")
    || ts.findConfigFile(path.dirname(target), ts.sys.fileExists, "jsconfig.json");
  const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : null;
  if (config?.error) throw new Error("INVALID_TSCONFIG");
  const parsed = configPath ? ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), undefined, configPath) : null;
  if (parsed?.errors.some((error) => error.code !== 18003)) throw new Error("INVALID_TSCONFIG");
  const options = parsed?.options || {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
    strict: true, allowJs: true, checkJs: true, allowImportingTsExtensions: true,
  };
  // The host overlays only this editor's buffer. Imports still resolve in the
  // real workspace, including package declarations, aliases and standard libs.
  const host = {
    ...ts.sys,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getCompilationSettings: () => ({ ...options, noEmit: true }),
    getScriptFileNames: () => [...new Set([...(parsed?.fileNames || []), target])],
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) => {
      const text = path.resolve(file) === target ? input.content : ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
  };
  const service = ts.createLanguageService(host);
  const severity = (category) => {
    switch (category) {
      case ts.DiagnosticCategory.Error: return "error";
      case ts.DiagnosticCategory.Warning: return "warning";
      case ts.DiagnosticCategory.Suggestion:
      case ts.DiagnosticCategory.Message: return "info";
      default: return "info";
    }
  };
  const kind = (value) => {
    switch (value) {
      case "method": case "function": case "local function": return "function";
      case "property": case "getter": case "setter": return "property";
      case "class": return "class";
      case "interface": case "type": return "type";
      case "const": case "enum member": return "constant";
      case "keyword": return "keyword";
      default: return "variable";
    }
  };
  let result;
  if (typeof input.position === "number") {
    const completion = service.getCompletionsAtPosition(target, input.position, {
      includeCompletionsForModuleExports: false,
      includeCompletionsWithInsertText: true,
      includeCompletionsWithSnippetText: false,
    });
    result = { completions: (completion?.entries || []).filter((entry) => !entry.hasAction && !entry.isSnippet).map((entry) => {
      const span = entry.replacementSpan || completion.optionalReplacementSpan;
      return {
        label: entry.name, type: kind(entry.kind), apply: entry.insertText || entry.name,
        ...(span ? { from: span.start, to: span.start + span.length } : {}),
      };
    }) };
  } else {
    const diagnostics = [...service.getSyntacticDiagnostics(target), ...service.getSemanticDiagnostics(target), ...service.getSuggestionDiagnostics(target)];
    result = { diagnostics: diagnostics.filter((item) => item.file?.fileName === target && item.start !== undefined).map((item) => ({
      from: item.start, to: item.start + (item.length || 0), severity: severity(item.category),
      message: ts.flattenDiagnosticMessageText(item.messageText, "\n"), code: item.code,
    })) };
  }
  service.dispose();
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({ code: error.message === "INVALID_PATH" ? "INVALID_PATH" : "ANALYSIS_UNAVAILABLE" }));
  process.exitCode = 1;
}
`;

export const createTypescriptCommand = (input: CodeIntelligenceRequestSchema & { home: string }) =>
  createSandboxCommand(typescriptCommand, input, 60);
