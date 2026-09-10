import type {
  CreateProjectFileResponseSchema,
  CreateProjectFileSchema,
} from "@/features/projects/actions/file-schemas";

export const isProjectFileResultValid = (
  result: CreateProjectFileResponseSchema,
  input: CreateProjectFileSchema,
): boolean =>
  !result.error &&
  result.data.path === [input.parentPath, input.name].filter(Boolean).join("/") &&
  result.data.name === input.name &&
  result.data.isDir === (input.kind === "folder");
