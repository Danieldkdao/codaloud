import { afterEach, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { hostUri: "192.168.1.20:8081" } },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("derives the local API URL when no public auth URL is configured", async () => {
  vi.stubEnv("EXPO_PUBLIC_BETTER_AUTH_URL", "");
  vi.stubGlobal("__DEV__", true);

  const { getBaseURL } = await import("@/lib/auth/utils");

  expect(getBaseURL()).toBe("http://192.168.1.20:8081");
});
