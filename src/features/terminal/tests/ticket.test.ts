import { expect, it } from "vitest";
import { issueTerminalTicket, verifyTerminalTicket } from "../server/ticket";

const owner = {
  userId: "00000000-0000-4000-8000-000000000001",
  deviceId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000003",
  sandboxId: "sandbox-1",
};

it("signs a project-bound short-lived ticket and rejects tampering or expiry", () => {
  const ticket = issueTerminalTicket(owner, "secret", 1_000);
  expect(verifyTerminalTicket(ticket, "secret", 2_000)).toMatchObject(owner);
  expect(() => verifyTerminalTicket(ticket, "other", 2_000)).toThrow();
  expect(() => verifyTerminalTicket(ticket, "secret", 62_000)).toThrow();
  expect(() => verifyTerminalTicket(`${ticket}x`, "secret", 2_000)).toThrow();
});
