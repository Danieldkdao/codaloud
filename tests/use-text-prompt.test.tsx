// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTextPrompt } from "@/hooks/use-text-prompt";

let root: Root;
let current: ReturnType<typeof useTextPrompt>;
const Probe = () => { current = useTextPrompt(); return null; };
const options = { title: "Save changes", message: "Name this stash", actionText: "Stash All", placeholder: "Stash name" };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

it("returns the entered name once and dismisses the prompt", async () => {
  let pending!: Promise<string | null>;
  act(() => { pending = current.prompt(options, new AbortController().signal); });
  const submit = current.props!.onSubmit;
  act(() => { submit("Login work"); submit("Repeated"); });
  await expect(pending).resolves.toBe("Login work");
  expect(current.props).toBeNull();
});
it("cancels on workspace invalidation and ignores late native callbacks", async () => {
  const controller = new AbortController();
  let pending!: Promise<string | null>;
  act(() => { pending = current.prompt(options, controller.signal); });
  const submit = current.props!.onSubmit;
  act(() => controller.abort());
  act(() => submit("Late name"));
  await expect(pending).resolves.toBeNull();
  expect(current.props).toBeNull();
});
it("does not present for an expired workspace", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(current.prompt(options, controller.signal)).resolves.toBeNull();
  expect(current.props).toBeNull();
});
it("resolves cancellation on unmount", async () => {
  let pending!: Promise<string | null>;
  act(() => { pending = current.prompt(options, new AbortController().signal); });
  act(() => root.render(null));
  await expect(pending).resolves.toBeNull();
});
it("cancels a replaced prompt without closing its replacement", async () => {
  let first!: Promise<string | null>;
  let second!: Promise<string | null>;
  act(() => { first = current.prompt(options, new AbortController().signal); });
  const oldSubmit = current.props!.onSubmit;
  act(() => { second = current.prompt(options, new AbortController().signal); });
  act(() => oldSubmit("Old"));
  expect(current.props).not.toBeNull();
  act(() => current.props!.onCancel());
  await expect(first).resolves.toBeNull();
  await expect(second).resolves.toBeNull();
});
