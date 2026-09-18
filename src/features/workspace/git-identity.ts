import { eq } from "drizzle-orm";
import { z } from "zod";
import { getLocalDatabase } from "@/db/local/database";
import { WorkspaceTable } from "@/db/local/workspace";

export const gitIdentitySchema = z.strictObject({
  name: z.string().trim().min(1, "Enter your Git author name.").max(200).regex(/^[^<>\r\n\0]+$/),
  email: z.email("Enter your Git author email.").max(320),
});
export type GitIdentitySchema = z.infer<typeof gitIdentitySchema>;

export const readGitIdentity = async (): Promise<GitIdentitySchema | null> => {
  const db = await getLocalDatabase();
  const existingWorkspace = db.select({ name: WorkspaceTable.gitAuthorName, email: WorkspaceTable.gitAuthorEmail })
    .from(WorkspaceTable).where(eq(WorkspaceTable.id, 1)).get();
  const result = gitIdentitySchema.safeParse(existingWorkspace);
  return result.success ? result.data : null;
};

export const saveGitIdentity = async (input: GitIdentitySchema) => {
  const identity = gitIdentitySchema.parse(input);
  const db = await getLocalDatabase();
  const updatedWorkspace = db.update(WorkspaceTable)
    .set({ gitAuthorName: identity.name, gitAuthorEmail: identity.email })
    .where(eq(WorkspaceTable.id, 1)).returning({ id: WorkspaceTable.id }).get();
  if (!updatedWorkspace) throw new Error("The local workspace is not ready.");
  return identity;
};

export const requireGitIdentity = async () => {
  const identity = await readGitIdentity();
  if (!identity) throw new Error("Set your Git author name and email in Settings before creating commits or stashes.");
  return identity;
};
