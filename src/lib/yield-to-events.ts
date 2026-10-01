// A resolved promise only yields to microtasks, which can starve native events.
export const yieldToEvents = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
