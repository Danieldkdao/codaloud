// React Native ships these as globals; neither Node nor happy-dom does, so any
// component that defers work to an idle callback would throw under test.
const deferred = new Map<number, ReturnType<typeof setTimeout>>();
let handle = 0;

globalThis.requestIdleCallback ??= (
  callback: (deadline: {
    didTimeout: boolean;
    timeRemaining: () => number;
  }) => void,
) => {
  const id = ++handle;
  deferred.set(
    id,
    setTimeout(() => {
      deferred.delete(id);
      callback({ didTimeout: false, timeRemaining: () => 50 });
    }, 0),
  );
  return id;
};

globalThis.cancelIdleCallback ??= (id: number) => {
  const timer = deferred.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    deferred.delete(id);
  }
};
