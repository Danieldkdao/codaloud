import { authClient } from "./auth-client";

export const getCurrentUserClient = async () => {
  const { data, error } = await authClient.getSession();

  return {
    userId: data?.user.id ?? null,
    user: data?.user ?? null,
    session: data?.session ?? null,
    error,
  };
};
