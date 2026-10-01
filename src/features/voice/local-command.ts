import {
  commandDestinations,
  type CommandNavigationSchema,
} from "./command-navigation";

// Exact navigation shortcuts work offline; open-ended requests use the agent.
export const readLocalCommand = (
  instruction: string,
): CommandNavigationSchema | null => {
  const text = instruction
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "");
  if (["back", "go back"].includes(text)) return { target: "back" };
  if (text === "close terminal") return { target: "terminal", open: false };
  const match =
    /^(?:open|show|go to) (?:the )?(files|git|agent|agent log|terminal|code|editor)$/.exec(
      text,
    );
  if (!match) return null;
  let target = match[1];
  if (target === "editor") target = "code";
  if (target === "agent log") target = "agent";
  const destination = commandDestinations.find((entry) => entry === target);
  return destination ? { target: destination } : null;
};
