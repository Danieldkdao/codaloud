import { normalizeCodeDiagnostics } from "../diagnostics";
import { mapUtf8OffsetsToUtf16 } from "./utf8-offsets";
import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";

type TreeSitterNode = {
  type: string;
  isError: boolean;
  isMissing: boolean;
  startIndex: number;
  endIndex: number;
  children: readonly TreeSitterNode[];
};

export type TreeSitterLanguage = {
  id: string;
  label: string;
};

// A missing node's type is the exact token the grammar wanted: ":" for a
// missing colon, ")" for an unclosed call. Quoting literals makes them
// obvious; named categories read better bare.
const describeMissing = (type: string) =>
  /^[\s\S]{1,3}$/.test(type) ? `'${type}'` : type;

// Only a single-child error node identifies one offending token. A node with
// several children is a recovered fragment, so name the last token the grammar
// did accept: the fault is at the boundary just after it.
const errorContext = (node: TreeSitterNode) => {
  const last = node.isError ? node.children[node.children.length - 1] : null;
  const token =
    last && last.endIndex - last.startIndex <= 24 ? last.type : null;
  return node.children.length === 1
    ? token && !node.children[0].children.length
      ? token
      : null
    : token;
};

// Grammar error nodes can span a whole block: a single missing colon turns a
// two-line function into one ERROR node covering every character. Reporting
// that range underlines the entire block and parks the message on the last
// line, far from the real fault. Anchor the finding to the first line of the
// error, which is where the parse actually broke.
const clampToFirstLine = (
  content: string,
  start: number,
  end: number,
): number => {
  const lineBreak = content.indexOf("\n", start);
  if (lineBreak < 0 || lineBreak >= end) return end;
  // Keep the newline out of the range so the highlight stays on one line.
  return lineBreak > start ? lineBreak : lineBreak;
};

export const getTreeSitterDiagnostics = (
  content: string,
  rootNode: TreeSitterNode,
  language: TreeSitterLanguage,
): CodeDiagnosticSchema[] => {
  const findings: {
    node: TreeSitterNode;
    startIndex: number;
    endIndex: number;
  }[] = [];
  const pendingNodes = [rootNode];

  while (pendingNodes.length && findings.length < 200) {
    const node = pendingNodes.pop()!;
    if (node.isError || node.isMissing) {
      if (
        Number.isInteger(node.startIndex) &&
        Number.isInteger(node.endIndex) &&
        node.startIndex >= 0 &&
        node.endIndex >= node.startIndex
      )
        findings.push({
          node,
          startIndex: node.startIndex,
          endIndex: node.endIndex,
        });
      continue;
    }
    for (let index = node.children.length - 1; index >= 0; index--)
      pendingNodes.push(node.children[index]);
  }

  // Clamp before mapping. The offset table only contains the ranges we ask
  // for, so a clamped end has to be mapped too or it falls back to the wide
  // original range.
  const ranges = findings.map(({ node, startIndex, endIndex }) => ({
    node,
    startIndex,
    endIndex: node.isMissing
      ? endIndex
      : clampToFirstLine(content, startIndex, endIndex),
  }));
  const mappedOffsets = mapUtf8OffsetsToUtf16(
    content,
    ranges.flatMap(({ startIndex, endIndex }) => [startIndex, endIndex]),
  );
  const source = `Tree-sitter: ${language.label}`;
  const code = `tree-sitter-${language.id}:syntax-error`;
  return normalizeCodeDiagnostics(
    content,
    ranges.flatMap(({ node, startIndex, endIndex }) => {
      const from = mappedOffsets.get(startIndex);
      const to = mappedOffsets.get(endIndex);
      if (from === undefined || to === undefined) return [];
      // Quote the offending token when the grammar identified one, otherwise
      // report the last token it accepted before the parse broke.
      const token = node.isError ? errorContext(node) : null;
      const recovered = node.children.length > 1;
      return [
        {
          from,
          to: Math.max(from, to),
          severity: "error" as const,
          message: node.isMissing
            ? `Expected ${describeMissing(node.type)}`
            : token
              ? recovered
                ? `Unexpected syntax after ${JSON.stringify(token)}`
                : `Unexpected ${JSON.stringify(token)}`
              : "Unexpected syntax",
          source,
          code,
        },
      ];
    }),
  );
};
