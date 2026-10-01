import { useQuery } from "@tanstack/react-query";
import { readBilling } from "../billing-actions";

export const useBillingStatus = (userId: string | undefined) =>
  useQuery({
    queryKey: ["billing", userId],
    queryFn: readBilling,
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
