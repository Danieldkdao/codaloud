import { normalizeCodeDiagnostics } from "../diagnostics";
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

const getUtf8ByteLength = (codePoint: number) => {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

const mapUtf8OffsetsToUtf16 = (content: string, offsets: number[]) => {
  const uniqueOffsets = [...new Set(offsets)].sort(
    (left, right) => left - right,
  );
  const mappedOffsets = new Map<number, number>();
  let offsetIndex = 0;
  let byteOffset = 0;
  let utf16Offset = 0;

  for (const codePoint of content) {
    while (uniqueOffsets[offsetIndex] === byteOffset) {
      mappedOffsets.set(uniqueOffsets[offsetIndex], utf16Offset);
      offsetIndex++;
    }

    byteOffset += getUtf8ByteLength(codePoint.codePointAt(0)!);
    utf16Offset += codePoint.length;
    while (uniqueOffsets[offsetIndex] === byteOffset) {
      mappedOffsets.set(uniqueOffsets[offsetIndex], utf16Offset);
      offsetIndex++;
    }
  }

  return mappedOffsets;
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

  const mappedOffsets = mapUtf8OffsetsToUtf16(
    content,
    findings.flatMap(({ startIndex, endIndex }) => [startIndex, endIndex]),
  );
  const source = `Tree-sitter: ${language.label}`;
  const code = `tree-sitter-${language.id}:syntax-error`;
  return normalizeCodeDiagnostics(
    content,
    findings.flatMap(({ node, startIndex, endIndex }) => {
      const from = mappedOffsets.get(startIndex);
      const to = mappedOffsets.get(endIndex);
      if (from === undefined || to === undefined) return [];
      return [
        {
          from,
          to,
          severity: "error" as const,
          message: node.isMissing
            ? `Expected ${node.type}`
            : "Unexpected syntax",
          source,
          code,
        },
      ];
    }),
  );
};
