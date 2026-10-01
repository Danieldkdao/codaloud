import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import { creditsForTopup } from "../constants";
import { grantVerifiedTopup, readBillingStatus } from "./billing-service";

const webhookSchema = z.object({
  event: z.object({
    id: z.string().min(1).max(255),
    type: z.string().min(1),
    app_user_id: z.uuid().optional().nullable(),
    product_id: z.string().optional().nullable(),
    transferred_from: z.array(z.string().max(255)).max(100).optional(),
    transferred_to: z.array(z.string().max(255)).max(100).optional(),
  }),
});

const authorized = (provided: string | null, expected: string | undefined) => {
  if (!provided || !expected) return false;
  const token = provided.replace(/^Bearer[ \t]+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const handleBillingWebhook = async (request: Request) => {
  if (
    !authorized(
      request.headers.get("authorization"),
      serverEnv.REVENUECAT_WEBHOOK_AUTH_TOKEN,
    )
  )
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 65536)
      return Response.json({ message: "Invalid event" }, { status: 400 });
    const parsed = webhookSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json({ message: "Invalid event" }, { status: 400 });
    const event = parsed.data.event;
    if (event.type === "TRANSFER") {
      const users = new Set(
        [
          ...(event.transferred_from ?? []),
          ...(event.transferred_to ?? []),
        ].filter((userId) => z.uuid().safeParse(userId).success),
      );
      if (users.size === 0)
        return Response.json({ message: "Invalid customer" }, { status: 400 });
      for (const userId of users) await readBillingStatus(userId);
      return Response.json({ received: true });
    }
    if (!event.app_user_id)
      return Response.json({ message: "Invalid customer" }, { status: 400 });
    if (event.type === "NON_RENEWING_PURCHASE" && event.product_id) {
      const credits = creditsForTopup(event.product_id);
      if (credits)
        await grantVerifiedTopup(event.app_user_id, event.id, credits);
    } else if (
      [
        "INITIAL_PURCHASE",
        "RENEWAL",
        "EXPIRATION",
        "CANCELLATION",
        "UNCANCELLATION",
      ].includes(event.type)
    ) {
      await readBillingStatus(event.app_user_id);
    }
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { message: "Event processing unavailable" },
      { status: 503 },
    );
  }
};
