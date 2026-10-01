import { generateKeyPairSync, verify } from "node:crypto";
import { expect, it } from "vitest";
import { createAppleClientSecret } from "../apple-client-secret";

it("signs a short-lived ES256 Apple client secret with the service ID", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const token = await createAppleClientSecret({
    clientId: "com.codaloud.signin",
    teamId: "TEAM123456",
    keyId: "KEY123456",
    privateKey: pem.replaceAll("\n", "\\n"),
  });
  const [header, payload, signature] = token.split(".");
  expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123456" });
  const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
  expect(claims).toMatchObject({ iss: "TEAM123456", sub: "com.codaloud.signin", aud: "https://appleid.apple.com" });
  expect(claims.exp - claims.iat).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  expect(verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature!, "base64url"))).toBe(true);
});
