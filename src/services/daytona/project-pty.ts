import { randomUUID } from "node:crypto";
import type { Sandbox } from "@daytona/sdk";

type ProjectPtyProcess = Pick<
  Sandbox["process"],
  "createPty" | "killPtySession"
>;

export const createProjectPty = async (
  process: ProjectPtyProcess,
  root: string,
  onData: (bytes: Uint8Array) => void,
) => {
  // A new session guarantees that a prior shell's cwd cannot carry over.
  const id = `codaloud-${randomUUID()}`;
  const handle = await process.createPty({
    id,
    cwd: root,
    cols: 80,
    rows: 24,
    envs: { TERM: "xterm-256color", LANG: "C.UTF-8" },
    onData,
  });

  return {
    id,
    handle,
    close: async () => {
      await handle.disconnect().catch(() => undefined);
      await process.killPtySession(id).catch(() => undefined);
    },
  };
};
