import { authClient } from "@/lib/auth/auth-client";

export const useAuthSession = () => {
  return authClient.useSession();
};
