import { createQueryClient } from "@/lib/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useEffect, useState } from "react";

export const QueryProvider = ({ children }: PropsWithChildren) => {
  // Keep the client stable across renders and isolated from other server renders.
  const [queryClient] = useState(createQueryClient);

  useEffect(() => () => queryClient.clear(), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
