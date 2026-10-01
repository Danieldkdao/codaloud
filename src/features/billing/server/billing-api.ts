import { getCurrentUser } from "@/lib/auth/helpers";
import {
  beginBillingTrial,
  endBillingTrial,
  readBillingStatus,
} from "./billing-service";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export const handleBillingRequest = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return reply({ message: "Sign in to view billing." }, 401);
    if (request.method === "GET") return reply(await readBillingStatus(userId));
    if (request.method === "DELETE") {
      try {
        return reply(await endBillingTrial(userId));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Manage this subscription in your app store."
        )
          return reply({ message: error.message }, 409);
        throw error;
      }
    }
    if (request.method === "POST") {
      try {
        return reply(await beginBillingTrial(userId));
      } catch (error) {
        if (error instanceof Error && error.message === "Trial is unavailable")
          return reply({ message: "Trial is unavailable." }, 409);
        throw error;
      }
    }
    return reply({ message: "Method not allowed." }, 405);
  } catch {
    return reply({ message: "Billing is unavailable. Please try again." }, 503);
  }
};
