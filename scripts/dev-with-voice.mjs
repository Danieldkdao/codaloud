import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

// Keep the API server and the separately dispatched agent alive together. Expo
// cannot run a persistent LiveKit worker inside an API route.
/**
 * @param {(code: number) => void} [exit]
 * @param {string[]} [expoArgs]
 */
export const startVoiceDevelopment = (exit = process.exit, expoArgs = []) => {
  // Native run commands already start Metro after building/installing the app.
  // Forward them directly rather than treating them as `expo start` arguments.
  const nativeBuild =
    expoArgs[0] === "run:ios" || expoArgs[0] === "run:android";
  const commandArgs = nativeBuild ? expoArgs : ["start", "-c", ...expoArgs];
  const children = new Set();
  let stopping = false;
  let finished = false;
  let exitCode = 0;
  let deadline;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", terminated);
    exit(exitCode);
  };
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of children) child.kill("SIGTERM");
    if (!children.size) return finish();
    deadline = setTimeout(() => {
      for (const child of children) child.kill("SIGKILL");
      finish();
    }, 10_000);
    deadline.unref();
  };
  const interrupted = () => stop(130);
  const terminated = () => stop(143);
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", terminated);

  const start = (name, args, stdio) => {
    try {
      const child = spawn(process.execPath, args, { stdio });
      children.add(child);
      const ended = (code) => {
        children.delete(child);
        if (!stopping && nativeBuild && name === "Expo" && code === 0) {
          // Expo can exit after installation when Metro is already running or
          // --no-bundler is used. The voice worker still belongs to this terminal.
          console.info(
            "[dev] Native build finished. Keeping the voice worker running; Ctrl+C stops it.",
          );
          return;
        }
        if (!stopping) {
          console.error(
            `[dev] ${name} stopped with exit code ${code}; shutting down managed services.`,
          );
          stop(code);
        }
        if (stopping && !children.size) finish();
      };
      child.once("error", () => ended(1));
      child.once("exit", (code, signal) => ended(code ?? (signal ? 1 : 0)));
    } catch {
      console.error(`[dev] Could not start ${name}.`);
      stop(1);
    }
  };
  console.info(
    "[dev] Starting Expo and the codaloud-voice worker. Wait for the worker's registration log before testing voice.",
  );
  start(
    "Voice worker",
    [
      "--env-file=.env",
      "--import",
      "tsx",
      "src/services/livekit/voice-worker.ts",
      "start",
    ],
    ["ignore", "inherit", "inherit"],
  );
  if (!stopping)
    start("Expo", [require.resolve("expo/bin/cli"), ...commandArgs], "inherit");
  return () => stop();
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startVoiceDevelopment(process.exit, process.argv.slice(2));
}
