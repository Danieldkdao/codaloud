import type { TerminalAccessRequirement } from "../actions/terminal-client";
import type { TerminalSnapshot } from "../actions/terminal-session";

export const formatTerminalStatus = (
  status: TerminalSnapshot["status"],
  access: TerminalAccessRequirement | null,
) => {
  switch (status) {
    case "closed":
      return "Closed";
    case "connecting":
      return "Connecting";
    case "ready":
      return "Ready";
    case "error":
      return "Unavailable";
    case "blocked":
      switch (access) {
        case "plan":
          return "Plan needed";
        case "credits":
          return "Credits needed";
        case "billing":
        case null:
          return "Billing needed";
      }
  }
};

export const formatTerminalAccess = (
  access: TerminalAccessRequirement | null,
  error: string | null,
) => {
  switch (access) {
    case "plan":
      return {
        title: "Pro or Premium required",
        description: "Choose a plan to run code in this project.",
        actionLabel: "View plans",
        href: "/billing",
        icon: "lock" as const,
      };
    case "credits":
      return {
        title: "Add credits to use the terminal",
        description: error ?? "Add credits to keep running code.",
        actionLabel: "Add credits",
        href: "/billing/topups",
        icon: "lock" as const,
      };
    case "billing":
      return {
        title: "Terminal access needed",
        description: error ?? "Check your plan and credits.",
        actionLabel: "View plans",
        href: "/billing",
        icon: "lock" as const,
      };
    case null:
      return {
        title: "Terminal unavailable",
        description: error ?? "Try connecting again.",
        actionLabel: null,
        href: null,
        icon: "alert-circle" as const,
      };
  }
};
