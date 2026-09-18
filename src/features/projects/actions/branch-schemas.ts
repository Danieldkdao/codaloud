import { z } from "zod";
import { projectBranchCursorTokenSchema } from "../lib/branch-params";

export const projectBranchNameSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (branch) =>
      branch !== "HEAD" &&
      branch !== "@" &&
      !branch.startsWith("-") &&
      !branch.startsWith("refs/") &&
      !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch) &&
      !branch.includes("..") &&
      !branch.includes("@{") &&
      !branch.endsWith(".") &&
      branch
        .split("/")
        .every(
          (part) => part && !part.startsWith(".") && !part.endsWith(".lock"),
        ),
    "Select a valid branch name.",
  );
export type ProjectBranchNameSchema = z.infer<typeof projectBranchNameSchema>;

export const projectBranchSources = ["local", "remote"] as const;
export type ProjectBranchSource = (typeof projectBranchSources)[number];
export const checkoutProjectBranchSchema = z.strictObject({
  branchName: projectBranchNameSchema,
  source: z.enum(projectBranchSources).optional(),
});
export type CheckoutProjectBranchSchema = z.infer<
  typeof checkoutProjectBranchSchema
>;

export const projectBranchCheckoutSchema = z.object({
  previousBranch: z.string().min(1).nullable(),
  currentBranch: projectBranchNameSchema,
});
export type ProjectBranchCheckoutSchema = z.infer<
  typeof projectBranchCheckoutSchema
>;

export const checkoutProjectBranchResponseSchema = z.discriminatedUnion(
  "error",
  [
    z.object({
      error: z.literal(true),
      message: z.string().min(1),
      code: z.string().min(1).optional(),
    }),
    z.object({
      error: z.literal(false),
      message: z.string().min(1),
      data: projectBranchCheckoutSchema,
    }),
  ],
);
export type CheckoutProjectBranchResponseSchema = z.infer<
  typeof checkoutProjectBranchResponseSchema
>;

export const projectBranchesSchema = z.object({
  branches: z.array(z.string().min(1)),
  currentBranch: z.string().min(1).nullable(),
});
export type ProjectBranchesSchema = z.infer<typeof projectBranchesSchema>;

export const projectBranchPageSchema = projectBranchesSchema
  .extend({
    nextCursor: projectBranchCursorTokenSchema.nullable(),
  })
  .refine(
    (page) => page.nextCursor === null || page.branches.length > 0,
    "An empty branch page cannot have a continuation cursor.",
  );
export type ProjectBranchPageSchema = z.infer<typeof projectBranchPageSchema>;

export const readProjectBranchesResponseSchema = z.object({
  error: z.literal(false),
  message: z.string(),
  data: projectBranchPageSchema,
});
export type ReadProjectBranchesResponseSchema = z.infer<
  typeof readProjectBranchesResponseSchema
>;
