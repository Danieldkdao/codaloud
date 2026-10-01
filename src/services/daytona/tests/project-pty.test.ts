import { expect, it, vi } from "vitest";
import { createProjectPty } from "../project-pty";

it("starts every terminal in its project workspace instead of reconnecting an old shell", async () => {
  const process = {
    createPty: vi.fn(async (_options: unknown) => ({
      disconnect: vi.fn(async () => {}),
    })),
    killPtySession: vi.fn(async () => {}),
    connectPty: vi.fn(),
  };
  const root = "/home/daytona/codaloud-workspace";
  const first = await createProjectPty(
    process as unknown as Parameters<typeof createProjectPty>[0],
    root,
    vi.fn(),
  );
  const second = await createProjectPty(
    process as unknown as Parameters<typeof createProjectPty>[0],
    root,
    vi.fn(),
  );

  expect(process.connectPty).not.toHaveBeenCalled();
  expect(process.createPty).toHaveBeenCalledTimes(2);
  expect(process.createPty.mock.calls[0][0]).toMatchObject({ cwd: root });
  expect(process.createPty.mock.calls[1][0]).toMatchObject({ cwd: root });
  expect(first.id).not.toBe(second.id);
});

it("removes its PTY session when the terminal closes", async () => {
  const disconnect = vi.fn(async () => {});
  const process = {
    createPty: vi.fn(async () => ({ disconnect })),
    killPtySession: vi.fn(async () => {}),
  };
  const session = await createProjectPty(
    process as unknown as Parameters<typeof createProjectPty>[0],
    "/home/daytona/codaloud-workspace",
    vi.fn(),
  );

  await session.close();

  expect(disconnect).toHaveBeenCalledOnce();
  expect(process.killPtySession).toHaveBeenCalledWith(session.id);
});
