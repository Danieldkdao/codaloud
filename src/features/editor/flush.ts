const defaultTimeout = 5000;

type EditorFlushOptions = {
  /** Milliseconds to wait for native per send before retrying or giving up. */
  timeout?: number;
  /** Sends allowed for one request. The native call is fire-and-forget, so a
   *  lost injection must not cost the caller the whole timeout. */
  attempts?: number;
};

export const createEditorFlush = (
  send: (requestId: string) => void,
  { timeout = defaultTimeout, attempts = 1 }: EditorFlushOptions = {},
) => {
  let sequence = 0;
  const pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
      left: number;
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
        pending.set(id, { resolve, reject, left: attempts });
        const arm = () => {
          const request = pending.get(id);
          if (!request) return;
          request.timer = setTimeout(() => {
            if (request.left > 1) {
              request.left -= 1;
              try {
                send(id);
              } catch {
                acknowledge(id, "The editor isn’t ready. Try again.");
                return;
              }
              arm();
              return;
            }
            acknowledge(
              id,
              "The editor didn’t respond. Keep this tab open and try again.",
            );
          }, timeout);
        };
        arm();
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
