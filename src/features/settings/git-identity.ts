import Storage from "expo-sqlite/kv-store";
import { z } from "zod";

export const gitIdentitySchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Enter your Git author name.")
    .max(200)
    .regex(/^[^<>\r\n\0]+$/),
  email: z.email("Enter your Git author email.").max(320),
});
export type GitIdentitySchema = z.infer<typeof gitIdentitySchema>;

export const readGitIdentity = async (): Promise<GitIdentitySchema | null> => {
  try {
    const savedIdentity = await Storage.getItem("git-identity");
    if (!savedIdentity) return null;
    const result = gitIdentitySchema.safeParse(JSON.parse(savedIdentity));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const saveGitIdentity = async (input: GitIdentitySchema) => {
  const identity = gitIdentitySchema.parse(input);
  await Storage.setItem("git-identity", JSON.stringify(identity));
  return identity;
};

export const requireGitIdentity = async () => {
  const identity = await readGitIdentity();
  if (!identity)
    throw new Error(
      "Set your Git author name and email in Settings before creating commits or stashes.",
    );
  return identity;
};
