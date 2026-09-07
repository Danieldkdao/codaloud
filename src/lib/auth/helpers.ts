import { requestHeaders } from "expo-server";
import { auth } from "./auth";

export const getCurrentUser = async (
  headers: Headers = new Headers(requestHeaders()),
) => {
  const session = await auth.api.getSession({ headers });
  return {
    userId: session?.user.id ?? null,
    user: session?.user ?? null,
    session: session?.session ?? null,
  };
};
