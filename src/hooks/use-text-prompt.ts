import { useEffect, useRef, useState } from "react";
import type { TextPromptProps } from "@/components/ui/text-prompt";

type TextPromptOptions = Omit<TextPromptProps, "onSubmit" | "onCancel">;

export const useTextPrompt = () => {
  const [props, setProps] = useState<TextPromptProps | null>(null);
  const cancelPending = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPending.current?.(), []);

  const prompt = (options: TextPromptOptions, signal?: AbortSignal) =>
    new Promise<string | null>((resolve) => {
      if (!signal || signal.aborted) return resolve(null);
      cancelPending.current?.();
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", cancel);
        cancelPending.current = null;
        setProps(null);
        resolve(signal.aborted ? null : value);
      };
      const cancel = () => finish(null);
      cancelPending.current = cancel;
      signal.addEventListener("abort", cancel, { once: true });
      setProps({ ...options, onSubmit: finish, onCancel: cancel });
    });

  return { prompt, props };
};
