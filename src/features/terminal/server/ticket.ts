import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.strictObject({
  userId: z.uuid(),
  deviceId: z.uuid(),
  projectId: z.uuid(),
  sandboxId: z.string().min(1).max(200),
  expiresAt: z.number().int(),
});
export type TerminalTicketPayload = z.infer<typeof payloadSchema>;

const signature = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");

export const issueTerminalTicket = (
  payload: Omit<TerminalTicketPayload, "expiresAt">,
  secret: string,
  now = Date.now(),
) => {
  const body = Buffer.from(
    JSON.stringify(
      payloadSchema.parse({ ...payload, expiresAt: now + 60_000 }),
    ),
  ).toString("base64url");
  return `${body}.${signature(body, secret)}`;
};

export const verifyTerminalTicket = (
  ticket: string,
  secret: string,
  now = Date.now(),
): TerminalTicketPayload => {
  const [body, received, extra] = ticket.split(".");
  if (!body || !received || extra || body.length > 2048)
    throw new Error("Invalid terminal ticket.");
  const expected = Buffer.from(signature(body, secret));
  const actual = Buffer.from(received);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("Invalid terminal ticket.");
  const payload = payloadSchema.parse(
    JSON.parse(Buffer.from(body, "base64url").toString()),
  );
  if (payload.expiresAt < now || payload.expiresAt > now + 60_000)
    throw new Error("Expired terminal ticket.");
  return payload;
};
