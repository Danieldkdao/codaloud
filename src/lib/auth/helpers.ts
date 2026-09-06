import { requestHeaders } from "expo-server";
import { auth } from "./auth";

export const getCurrentUser = async () => {
  const headers = new Headers(requestHeaders());

  const session = await auth.api.getSession();
  return {
    userId: session?.user.id ?? null,
    user: session?.user ?? null,
    session: session?.session ?? null,
  };
};
