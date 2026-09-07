import { QueryClient } from "@tanstack/react-query";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) => {
          if (error.name === "AbortError") return false;

          // Validation, authentication, and rate-limit errors need caller action.
          if (
            "status" in error &&
            typeof error.status === "number" &&
            error.status >= 400 &&
            error.status < 500
          ) {
            return false;
          }

          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
