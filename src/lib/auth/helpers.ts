import { auth } from "./auth";

export const getCurrentUser = async (headers: Headers) => {
  const session = await auth.api.getSession({ headers });

  return {
    userId: session?.user.id ?? null,
    user: session?.user ?? null,
    session: session?.session ?? null,
  };
};
