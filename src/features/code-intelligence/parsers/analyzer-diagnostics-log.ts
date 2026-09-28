/** `__DEV__` is Metro-injected and absent in the Node worker, so read it guarded
 * or a recoverable "unavailable" becomes a ReferenceError crash. */
export const isAnalyzerDevHost = () =>
  typeof __DEV__ !== "undefined" && __DEV__ !== false;

export const warnAnalyzerFailure = (message: string, error?: unknown) => {
  if (!isAnalyzerDevHost()) return;
  const detail =
    error instanceof Error ? error.message : error ? String(error) : undefined;
  console.warn(detail ? `${message}: ${detail}` : message);
};
