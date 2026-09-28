import { XMLValidator } from "fast-xml-parser";
import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";
import { printParseErrorCode, parse as parseJsonc } from "jsonc-parser";
import { parse as parseJson5 } from "json5";
import parseToml from "@iarna/toml/parse-string";
import { parseDocument } from "yaml";
import {
  getCodeFileType,
  isFormatFileType,
  type CodeFileType,
} from "./file-type";
import type { TreeSitterGrammarId } from "./parsers/grammars";
import type { AnalyzerWasmLoader } from "./parsers/analyzer-asset-url";

type FormatAnalysis = {
  status: "ready" | "unavailable";
  diagnostics: CodeDiagnosticSchema[];
};

type FormatAnalyzer = {
  analyze: (content: string) => Promise<FormatAnalysis>;
  dispose: () => void;
};

type ParseFinding = {
  from: number;
  to?: number;
  message: string;
  code: string;
  source?: string;
};

const jsonParserTypes = new Set<CodeFileType>(["json", "jsonc", "json5"]);
const treeSitterFormatTypes = new Set<CodeFileType>(["shell", "dockerfile"]);
const getSource = (fileType: CodeFileType) => {
  switch (fileType) {
    case "json":
      return "JSON parser";
    case "jsonc":
      return "JSONC parser";
    case "json5":
      return "JSON5 parser";
    case "yaml":
      return "YAML parser";
    case "toml":
      return "TOML parser";
    case "xml":
      return "XML parser";
    case "ini":
      return "INI parser";
    case "env":
      return "Environment file parser";
    case "markdown":
      return "Markdown front matter parser";
    case "shell":
      return "Tree-sitter: Shell";
    case "dockerfile":
      return "Tree-sitter: Dockerfile";
    default:
      return "Format parser";
  }
};

const getPositionFromLineColumn = (
  content: string,
  line: number,
  column: number,
) => {
  let currentLine = 1;
  let lineStart = 0;
  while (currentLine < line && lineStart < content.length) {
    const newlineIndex = content.indexOf("\n", lineStart);
    if (newlineIndex < 0) return content.length;
    lineStart = newlineIndex + 1;
    currentLine++;
  }
  return Math.min(content.length, lineStart + Math.max(0, column - 1));
};

const getYamlFinding = (
  content: string,
  offsetAdjustment = 0,
): ParseFinding | undefined => {
  const document = parseDocument(content, {
    keepSourceTokens: true,
    logLevel: "error",
    prettyErrors: false,
    uniqueKeys: true,
    version: "1.2",
  });
  const error = document.errors[0];
  if (!error) return undefined;
  const errorOffset =
    "pos" in error && Array.isArray(error.pos)
      ? Number(error.pos[0])
      : "offset" in error
        ? Number(error.offset)
        : 0;
  return {
    from: offsetAdjustment + (Number.isFinite(errorOffset) ? errorOffset : 0),
    message: error.message,
    code: "yaml:syntax-error",
    source: "YAML parser",
  };
};

const getJsonFinding = (
  fileType: CodeFileType,
  content: string,
): ParseFinding | undefined => {
  if (fileType === "json5") {
    try {
      parseJson5(content);
      return undefined;
    } catch (error) {
      const parseError = error as Error & {
        lineNumber?: number;
        columnNumber?: number;
      };
      const message = parseError.message || "Invalid JSON5";
      const location = message.match(/at line (\d+) column (\d+)/i);
      const line = parseError.lineNumber ?? Number(location?.[1]);
      const column = parseError.columnNumber ?? Number(location?.[2]);
      return {
        from:
          Number.isInteger(line) && Number.isInteger(column)
            ? getPositionFromLineColumn(content, line, column)
            : 0,
        message: message.split("\n", 1)[0],
        code: "json5:syntax-error",
      };
    }
  }

  const errors: { error: number; offset: number; length: number }[] = [];
  parseJsonc(content, errors, {
    allowEmptyContent: false,
    allowTrailingComma: fileType === "jsonc",
    disallowComments: fileType === "json",
  });
  const error = errors[0];
  if (!error) return undefined;
  const grammarName = fileType === "json" ? "json" : "jsonc";
  return {
    from: error.offset,
    to: error.offset + error.length,
    message: `Unexpected JSON syntax: ${printParseErrorCode(error.error)}`,
    code: `${grammarName}:${printParseErrorCode(error.error).toLowerCase()}`,
  };
};

const getTomlFinding = (content: string): ParseFinding | undefined => {
  try {
    parseToml(content);
    return undefined;
  } catch (error) {
    const parseError = error as Error & {
      pos?: number;
      line?: number;
      col?: number;
    };
    const from =
      Number.isInteger(parseError.pos) &&
      parseError.pos! >= 0 &&
      parseError.pos! <= content.length
        ? parseError.pos!
        : Number.isInteger(parseError.line) && Number.isInteger(parseError.col)
          ? getPositionFromLineColumn(
              content,
              parseError.line!,
              parseError.col!,
            )
          : 0;
    return {
      from,
      message: parseError.message?.split("\n", 1)[0] || "Invalid TOML syntax",
      code: "toml:syntax-error",
    };
  }
};

const getXmlFinding = (content: string): ParseFinding | undefined => {
  const result = XMLValidator.validate(content, {
    allowBooleanAttributes: false,
  });
  if (result === true) return undefined;
  const { code, msg, line, col } = result.err;
  return {
    from: getPositionFromLineColumn(content, line, col),
    message: msg,
    code: `xml:${code.toLowerCase()}`,
  };
};

const getIniFinding = (content: string): ParseFinding | undefined => {
  for (const match of content.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    const line = match[0].replace(/(?:\r\n|\r|\n)$/, "");
    const offset = match.index ?? 0;
    if (!match[0]) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#"))
      continue;
    if (trimmed.startsWith("[") || trimmed.endsWith("]")) {
      if (!/^\[[^\[\]\r\n]+\]$/.test(trimmed))
        return {
          from: offset + Math.max(0, line.indexOf(trimmed)),
          message: "Expected an INI section name enclosed in brackets",
          code: "ini:invalid-section",
        };
      continue;
    }
    const separator = line.indexOf("=");
    const key = (separator < 0 ? "" : line.slice(0, separator)).trim();
    if (separator < 0 || !key || /[\[\]]/.test(key))
      return {
        from: offset + Math.max(0, line.indexOf(trimmed)),
        message: "Expected an INI key=value entry",
        code: "ini:invalid-entry",
      };
  }
  return undefined;
};

const getEnvironmentFinding = (content: string): ParseFinding | undefined => {
  const lines = [...content.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)].filter(
    (match) => Boolean(match[0]),
  );
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const match = lines[lineIndex];
    const line = match[0].replace(/(?:\r\n|\r|\n)$/, "");
    const offset = match.index ?? 0;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const assignmentMatch = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
      trimmed,
    );
    if (!assignmentMatch)
      return {
        from: offset + Math.max(0, line.indexOf(trimmed)),
        message: "Expected an environment variable assignment",
        code: "env:invalid-assignment",
      };

    let value = trimmed.slice(assignmentMatch[0].length).trimStart();
    const quote = value[0];
    if (quote === "'" || quote === '"') {
      let closesQuote = false;
      let escaped = false;
      for (
        let currentLine = lineIndex;
        currentLine < lines.length;
        currentLine++
      ) {
        if (currentLine > lineIndex)
          value = lines[currentLine][0].replace(/(?:\r\n|\r|\n)$/, "");
        for (
          let index = currentLine === lineIndex ? 1 : 0;
          index < value.length;
          index++
        ) {
          const character = value[index];
          if (character === quote && !escaped) {
            closesQuote = true;
            break;
          }
          escaped = quote === '"' && character === "\\" && !escaped;
          if (character !== "\\") escaped = false;
        }
        if (closesQuote) {
          lineIndex = currentLine;
          break;
        }
      }
      if (!closesQuote)
        return {
          from: offset + line.indexOf(quote),
          message: "Unclosed quoted environment value",
          code: "env:unclosed-quote",
        };
    }
  }
  return undefined;
};

const createDiagnostic = (
  content: string,
  fileType: CodeFileType,
  finding: ParseFinding,
  sourceOverride?: string,
): CodeDiagnosticSchema | undefined => {
  const from = finding.from;
  const to = finding.to ?? Math.min(content.length, from + 1);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > content.length
  )
    return undefined;
  return {
    from,
    to,
    severity: "error",
    message: finding.message,
    source: sourceOverride ?? finding.source ?? getSource(fileType),
    code: finding.code,
  };
};

const getMarkdownFinding = (content: string): ParseFinding | undefined => {
  const firstLineEnd = content.indexOf("\n");
  const firstLine = (
    firstLineEnd < 0 ? content : content.slice(0, firstLineEnd)
  ).replace(/\r$/, "");
  if (firstLine !== "---") return undefined;

  const frontMatterStart = firstLineEnd < 0 ? content.length : firstLineEnd + 1;
  const closingMatch = /^(?:---|\.\.\.)\s*$/m.exec(
    content.slice(frontMatterStart),
  );
  if (!closingMatch)
    return {
      from: content.length,
      message: "Front matter opened with --- but has no closing delimiter",
      code: "markdown:unclosed-front-matter",
    };
  return getYamlFinding(
    content.slice(frontMatterStart, frontMatterStart + closingMatch.index),
    frontMatterStart,
  );
};

const getFormatFinding = (
  fileType: CodeFileType,
  content: string,
): ParseFinding | undefined => {
  switch (fileType) {
    case "json":
    case "jsonc":
    case "json5":
      return getJsonFinding(fileType, content);
    case "yaml":
      return getYamlFinding(content);
    case "toml":
      return getTomlFinding(content);
    case "xml":
      return getXmlFinding(content);
    case "ini":
      return getIniFinding(content);
    case "env":
      return getEnvironmentFinding(content);
    case "markdown":
      return getMarkdownFinding(content);
    default:
      return undefined;
  }
};

export const isFormatAnalyzerType = (fileType: CodeFileType) =>
  isFormatFileType(fileType);

export const createFormatAnalyzer = async (
  fileType: CodeFileType,
  loadWasmBytes?: AnalyzerWasmLoader,
): Promise<FormatAnalyzer> => {
  if (treeSitterFormatTypes.has(fileType)) {
    const { createTreeSitterLanguageAnalyzer } =
      await import("./parsers/grammar-loader");
    // Without a host loader there is nothing to read the wasm grammar bytes with,
    // so the analyzer degrades to "unavailable" instead of throwing at load time.
    const load =
      loadWasmBytes ??
      ((async () => {
        throw new Error("This host has no wasm loader for tree-sitter.");
      }) satisfies AnalyzerWasmLoader);
    const treeSitterAnalyzer = createTreeSitterLanguageAnalyzer(
      fileType as TreeSitterGrammarId,
      load,
    );
    return {
      analyze: async (content) => {
        const result = await treeSitterAnalyzer.analyze(content);
        return {
          status: result.status,
          diagnostics: result.diagnostics,
        };
      },
      dispose: treeSitterAnalyzer.dispose,
    };
  }

  return {
    analyze: async (content) => {
      if (
        new TextEncoder().encode(content).length > MAX_PROJECT_FILE_SIZE_BYTES
      )
        return { status: "unavailable", diagnostics: [] };
      try {
        const parseStartedAt = Date.now();
        const finding = getFormatFinding(fileType, content);
        if (Date.now() - parseStartedAt > 100)
          return { status: "unavailable", diagnostics: [] };
        return {
          status: "ready",
          diagnostics: finding
            ? [createDiagnostic(content, fileType, finding)].filter(
                (diagnostic): diagnostic is CodeDiagnosticSchema =>
                  Boolean(diagnostic),
              )
            : [],
        };
      } catch {
        return { status: "unavailable", diagnostics: [] };
      }
    },
    dispose: () => {},
  };
};

export const analyzeFormatFile = async (
  path: string,
  content: string,
): Promise<FormatAnalysis> => {
  const fileType = getCodeFileType(path);
  if (!isFormatAnalyzerType(fileType))
    return { status: "unavailable", diagnostics: [] };
  const analyzer = await createFormatAnalyzer(fileType);
  try {
    return await analyzer.analyze(content);
  } finally {
    analyzer.dispose();
  }
};
