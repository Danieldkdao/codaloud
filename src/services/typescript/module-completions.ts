import ts from "./generated/compiler";
import type { CodeIntelligenceRequestSchema } from "@/features/projects/actions/code-intelligence-schemas";
import type { Node, StringLiteral } from "typescript";

// Module paths need configuration and directory metadata, not the source file's
// dependency graph. Keep TypeScript's own alias/package/exports completion rules
// by asking a separate lightweight service about just this import string.
export const isolateModuleSpecifier = (
  input: CodeIntelligenceRequestSchema,
) => {
  if (input.position === undefined || input.operation) return null;
  const position = input.position;
  const source = ts.createSourceFile(
    input.path,
    input.content,
    ts.ScriptTarget.Latest,
    true,
  );
  let literal: StringLiteral | undefined;
  const visit = (node: Node): void => {
    if (position < node.getStart(source) || position > node.end) return;
    if (ts.isStringLiteral(node)) {
      const parent = node.parent;
      const moduleSpecifier =
        ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
          parent.moduleSpecifier === node) ||
        (ts.isExternalModuleReference(parent) && parent.expression === node) ||
        (ts.isCallExpression(parent) &&
          parent.arguments[0] === node &&
          (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(parent.expression) &&
              parent.expression.text === "require")));
      const start = node.getStart(source);
      const end = node.end - (node.isUnterminated ? 0 : 1);
      if (moduleSpecifier && position > start && position <= end)
        literal = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!literal) return null;
  const start = literal.getStart(source);
  const parent = literal.parent;
  // Keep CommonJS and dynamic-import resolution modes when packages expose
  // different entry points for import and require.
  const prefix = ts.isExternalModuleReference(parent)
    ? "import value = require("
    : ts.isCallExpression(parent)
      ? parent.expression.kind === ts.SyntaxKind.ImportKeyword
        ? "import("
        : "require("
      : "import ";
  const offset = start - prefix.length;
  return {
    offset,
    input: {
      ...input,
      content: `${prefix}${input.content.slice(start, literal.end)}`,
      position: position - offset,
    },
  };
};
