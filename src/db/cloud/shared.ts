export const authProviders = ["github", "google"] as const;
export type AuthProvider = (typeof authProviders)[number];
