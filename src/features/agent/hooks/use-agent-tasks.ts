import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/auth-client";
import { agentTasks } from "../task-runtime";
import { agentPlans } from "../plan-runtime";

export const useAgentTasks = () =>
  useSyncExternalStore(agentTasks.subscribe, agentTasks.getSnapshot);
export const AgentTaskRuntime = () => {
  const session = authClient.useSession();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const client = useQueryClient();
  const observed = useRef(new Map<string, number>());
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    agentTasks.setSession(session.data?.user.id ?? null, foreground);
    agentPlans.setSession(session.data?.user.id ?? null, foreground);
    return () => {
      agentTasks.setSession(null, false);
      agentPlans.setSession(null, false);
    };
  }, [session.data?.user.id, foreground]);
  useEffect(
    () =>
      agentTasks.subscribe(() => {
        const changed = agentTasks.getSnapshot().some((record) => {
          const completed = record.event.logs.filter((log) =>
            log.startsWith("Completed "),
          ).length;
          if (observed.current.get(record.event.id) === completed) return false;
          observed.current.set(record.event.id, completed);
          return completed > 0;
        });
        if (!changed) return;
        // Existing hooks remain the owners of their queries; task mutations refresh
        // those views through the same cache rather than duplicating workspace state.
        void client.invalidateQueries({
          predicate: (query) =>
            query.queryKey.includes("projects") ||
            query.queryKey.includes("project"),
        });
      }),
    [client],
  );
  return null;
};
