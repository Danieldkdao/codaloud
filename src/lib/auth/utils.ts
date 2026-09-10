import { SignJWT, importPKCS8 } from "jose";
import { clientEnv } from "@/data/env/client";
import Constants from "expo-constants";

export const generateAppleClientSecret = async (
  clientId: string,
  teamId: string,
  keyId: string,
  privateKey: string,
) => {
  // Hosted environment values may contain escaped newlines from a .p8 file.
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
};

export const getBaseURL = () => {
  if (clientEnv.EXPO_PUBLIC_BETTER_AUTH_URL) {
    return clientEnv.EXPO_PUBLIC_BETTER_AUTH_URL;
  }
  if (__DEV__ && Constants.expoConfig?.hostUri) {
    return `http://${Constants.expoConfig.hostUri}`;
  }
  throw new Error(
    "Set EXPO_PUBLIC_BETTER_AUTH_URL to the deployed auth server URL.",
  );
};
