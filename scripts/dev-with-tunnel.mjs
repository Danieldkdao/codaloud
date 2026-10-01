import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { prepareIosNativeAssets } from "./prepare-ios-native-assets.mjs";

const apiPort = 8081;
const voicePort = 8089;
const defaultTerminalPort = 8787;

const isPortOccupied = (port) => {
  try {
    return Boolean(
      execFileSync("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch (error) {
    if (error && typeof error === "object" && error.status === 1) return false;
    throw error;
  }
};

const getBaseURL = (value) => {
  let url;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(
      "Set DEV_TUNNEL_URL to your HTTPS Dev Tunnel endpoint in .env.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "DEV_TUNNEL_URL must be an HTTPS origin without credentials, a path or port.",
    );
  return url.origin;
};

export const startDevelopmentWithTunnel = async ({
  env = process.env,
  spawnProcess = spawn,
  portOccupied = isPortOccupied,
  signals = process,
  args = process.argv.slice(2),
} = {}) => {
  // Tooling runs before application env modules and must configure their URLs directly.
  const baseURL = getBaseURL(env.DEV_TUNNEL_URL?.trim());
  const terminalPort = Number(env.TERMINAL_PORT || defaultTerminalPort);
  if (
    !Number.isInteger(terminalPort) ||
    terminalPort < 1 ||
    terminalPort > 65535
  )
    throw new Error("TERMINAL_PORT must be a valid TCP port.");
  if (await portOccupied(voicePort))
    throw new Error(
      `A voice worker is already running on port ${voicePort}. Stop the previous iOS development terminal with Ctrl+C before restarting; an old worker can still receive voice jobs.`,
    );
  if (await portOccupied(apiPort))
    throw new Error(
      `Metro is already running on port ${apiPort}. Stop the previous iOS development terminal with Ctrl+C before restarting so the API uses this run's environment.`,
    );
  if (await portOccupied(terminalPort))
    throw new Error(
      `A terminal gateway is already running on port ${terminalPort}. Stop the previous iOS development terminal with Ctrl+C before restarting.`,
    );
  const isIos = args[0] === "--ios";
  const isAndroid = args[0] === "--android";
  const commandArgs = isIos
    ? ["run:ios", "--device", ...args.slice(1)]
    : isAndroid
      ? ["run:android", ...args.slice(1)]
      : ["start", ...args];
  if (isIos) prepareIosNativeAssets();

  console.info(`[dev] API Dev Tunnel: ${baseURL}`);
  console.info(`[dev] Apple callback: ${baseURL}/api/auth/callback/apple`);
  console.info(`[dev] RevenueCat webhook: ${baseURL}/api/billing/webhook`);
  const child = spawnProcess(
    process.execPath,
    [
      "scripts/dev-with-voice.mjs",
      "--trigger-dev",
      ...commandArgs,
      "--port",
      String(apiPort),
    ],
    {
      stdio: "inherit",
      env: {
        ...env,
        BETTER_AUTH_URL: baseURL,
        EXPO_PUBLIC_BETTER_AUTH_URL: baseURL,
      },
    },
  );
  const interrupted = () => child.kill("SIGINT");
  const terminated = () => child.kill("SIGTERM");
  signals.once("SIGINT", interrupted);
  signals.once("SIGTERM", terminated);
  try {
    return await new Promise((done) => {
      child.once("exit", (code, signal) =>
        done(code ?? (signal === "SIGINT" ? 130 : 1)),
      );
      child.once("error", () => done(1));
    });
  } finally {
    signals.off("SIGINT", interrupted);
    signals.off("SIGTERM", terminated);
  }
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await startDevelopmentWithTunnel();
  } catch (error) {
    console.error(
      `[ios] ${error instanceof Error ? error.message : "Unable to start development services."}`,
    );
    process.exitCode = 1;
  }
}
