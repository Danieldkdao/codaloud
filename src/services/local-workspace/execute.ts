import { z } from "zod";
import type { WorkspaceCommand } from "./types";
import LocalWorkspace from "../../../modules/local-workspace";

export class LocalWorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);

export const executeWorkspace = async (
  projectId: string,
  ...[operation, args]: WorkspaceCommand
): Promise<unknown> => {
  const id = z.uuid().parse(projectId).toLowerCase();
  const response = responseSchema.parse(
    JSON.parse(
      await LocalWorkspace.execute(
        JSON.stringify({ projectId: id, operation, args: args ?? {} }),
      ),
    ),
  );
  if (!response.ok)
    throw new LocalWorkspaceError(response.code, response.message);
  return response.data;
};
