import { importPKCS8, SignJWT } from "jose";

type AppleClientSecretInput = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
};

export const createAppleClientSecret = async ({
  clientId,
  teamId,
  keyId,
  privateKey,
}: AppleClientSecretInput) => {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey.replaceAll("\\n", "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 30 * 24 * 60 * 60)
    .sign(key);
};
