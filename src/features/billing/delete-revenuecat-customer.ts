import { serverEnv } from "@/data/env/server";

export const deleteRevenueCatCustomer = async (userId: string) => {
  const key = serverEnv.REVENUECAT_SECRET_API_KEY;
  if (
    key.startsWith("test_") ||
    key.startsWith("appl_") ||
    key.startsWith("goog_")
  ) {
    throw new Error(
      "Account deletion needs a RevenueCat secret API key on the server.",
    );
  }

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    },
  );

  // RevenueCat documents 404 as a successful ensure-deleted result for this endpoint.
  if (response.status !== 200 && response.status !== 404) {
    throw new Error(
      "RevenueCat could not remove your billing profile. Please retry.",
    );
  }
};
