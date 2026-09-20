export const createEditorFlush = (send: (requestId: string) => void) => {
  let sequence = 0;
  const pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const acknowledge = (id: string, error: string | null) => {
    const request = pending.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve();
  };
  return {
    flush: () =>
      new Promise<void>((resolve, reject) => {
        const id = String(++sequence);
        pending.set(id, {
          resolve,
          reject,
          timer: setTimeout(
            () =>
              acknowledge(
                id,
                "The editor didn’t respond. Keep this tab open and try again.",
              ),
            5000,
          ),
        });
        try {
          send(id);
        } catch {
          acknowledge(id, "The editor isn’t ready. Try again.");
        }
      }),
    acknowledge,
    dispose: () => {
      for (const id of pending.keys())
        acknowledge(id, "The editor closed before changes were delivered.");
    },
  };
};
