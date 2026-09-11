// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppThemeProvider, useTheme } from "@/hooks/use-theme";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), write: vi.fn(), appearance: vi.fn(), scheme: "light",
}));
vi.mock("expo-secure-store", () => ({ getItemAsync: mocks.read, setItemAsync: mocks.write }));
vi.mock("nativewind", () => ({ useUnstableNativeVariable: () => "theme-color" }));
vi.mock("react-native", () => ({
  Appearance: { setColorScheme: mocks.appearance },
  useColorScheme: () => mocks.scheme,
}));
vi.mock("expo-router", () => ({
  DefaultTheme: { colors: {}, fonts: {} }, DarkTheme: { colors: {}, fonts: {} },
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));

let root: Root;
let container: HTMLDivElement;
let theme: ReturnType<typeof useTheme>;
const Consumer = () => { theme = useTheme(); return createElement("span", null, theme.preference); };
const render = async () => {
  await act(async () => root.render(createElement(AppThemeProvider, null, createElement(Consumer))));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scheme = "light";
  mocks.read.mockReset().mockResolvedValue(null);
  mocks.write.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); });

it("defaults to System without persisting over a saved preference during startup", async () => {
  await render();
  expect(theme.preference).toBe("system");
  expect(theme.isReady).toBe(true);
  expect(mocks.appearance).toHaveBeenLastCalledWith("unspecified");
  expect(mocks.write).not.toHaveBeenCalled();
});

it("restores a saved theme before showing app content", async () => {
  let finishRead!: (value: string) => void;
  mocks.read.mockReturnValue(new Promise((resolve) => { finishRead = resolve; }));
  await render();
  expect(theme.isReady).toBe(false);
  await act(async () => finishRead("dark"));
  expect(theme.preference).toBe("dark");
  expect(theme.isDarkMode).toBe(true);
  expect(mocks.appearance).toHaveBeenLastCalledWith("dark");
});

it("applies and saves manual choices, then restores live system tracking", async () => {
  await render();
  await act(async () => theme.setPreference("dark"));
  expect(theme.isDarkMode).toBe(true);
  await act(async () => theme.setPreference("light"));
  expect(theme.isDarkMode).toBe(false);
  await act(async () => theme.setPreference("system"));
  expect(mocks.appearance).toHaveBeenLastCalledWith("unspecified");
  mocks.scheme = "dark";
  await render();
  expect(theme.isDarkMode).toBe(true);
  expect(mocks.write.mock.calls.map((call) => call[1])).toEqual(["dark", "light", "system"]);
});

it.each(["invalid", null])("falls back to System for %s storage", async (value) => {
  mocks.read.mockResolvedValue(value);
  await render();
  expect(theme.preference).toBe("system");
  expect(theme.isReady).toBe(true);
});

it("keeps the app usable when preference storage fails", async () => {
  mocks.read.mockRejectedValue(new Error("Unavailable"));
  await render();
  expect(theme.isReady).toBe(true);
  mocks.write.mockRejectedValue(new Error("Unavailable"));
  await act(async () => theme.setPreference("dark"));
  expect(theme.isDarkMode).toBe(true);
  expect(theme.error).toBeTruthy();
});

it("serializes rapid native writes so the last selection wins on restart", async () => {
  let finishWrite!: () => void;
  mocks.write.mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
  await render();
  await act(async () => { theme.setPreference("dark"); theme.setPreference("light"); });
  expect(mocks.write).toHaveBeenCalledTimes(1);
  await act(async () => finishWrite());
  expect(mocks.write.mock.calls.map((call) => call[1])).toEqual(["dark", "light"]);
});
