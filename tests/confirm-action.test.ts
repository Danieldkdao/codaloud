import { beforeEach, expect, it, vi } from "vitest";
import type { AlertButton } from "react-native";

import { confirmAction } from "@/lib/utils";

const mocks = vi.hoisted(() => ({ platform: { OS: "ios" }, alert: vi.fn(), confirm: vi.fn() }));
vi.mock("react-native", () => ({ Platform: mocks.platform, Alert: { alert: mocks.alert } }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => undefined }));

beforeEach(() => {
  mocks.platform.OS = "ios";
  vi.stubGlobal("window", { confirm: mocks.confirm });
});

it.each(["ios", "android"])("only invokes the action on confirmation on %s", (os) => {
  mocks.platform.OS = os;
  const onConfirmPress = vi.fn();
  confirmAction("Delete project?", "This cannot be undone.", { actionText: "Delete", onConfirmPress });
  expect(mocks.alert).toHaveBeenCalledWith("Delete project?", "This cannot be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirmPress },
  ]);
  expect(onConfirmPress).not.toHaveBeenCalled();
  const buttons = mocks.alert.mock.calls[0][2] as AlertButton[];
  buttons[0].onPress?.();
  expect(onConfirmPress).not.toHaveBeenCalled();
  buttons[1].onPress?.();
  expect(onConfirmPress).toHaveBeenCalledOnce();
});

it("accepts a custom cancel label", () => {
  confirmAction("Delete?", "Confirm deletion.", { cancelText: "Keep", actionText: "Delete", onConfirmPress: vi.fn() });
  expect(mocks.alert.mock.calls[0][2][0].text).toBe("Keep");
});

it.each([true, false])("respects browser confirmation %s", (confirmed) => {
  mocks.platform.OS = "web";
  mocks.confirm.mockReturnValue(confirmed);
  const onConfirmPress = vi.fn();
  confirmAction("Delete?", "Confirm deletion.", { actionText: "Delete", onConfirmPress });
  expect(mocks.confirm).toHaveBeenCalledWith("Delete?\n\nConfirm deletion.");
  expect(onConfirmPress).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  expect(mocks.alert).not.toHaveBeenCalled();
});
