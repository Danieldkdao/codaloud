import * as SecureStore from "expo-secure-store";
import {
  gitHubCredentialSchema,
  type GitHubCredentialSchema,
  type GitHubOAuthTokenSchema,
  type GitHubProfileSchema,
} from "./authorization-schemas";

type GitHubConnectionState = {
  ready: boolean;
  profile: GitHubProfileSchema | null;
  scopes: string[];
  error: string | null;
};
const key = "codaloud.github.connection";
let credential: GitHubCredentialSchema | null = null;
let snapshot: GitHubConnectionState = {
  ready: false,
  profile: null,
  scopes: [],
  error: null,
};
let revision = 0;
let loading: Promise<void> | undefined;
let refreshing: Promise<string> | undefined;
let writing = Promise.resolve();
const listeners = new Set<() => void>();
const publish = (error: string | null = null) => {
  snapshot = {
    ready: true,
    profile: credential?.profile ?? null,
    scopes: credential?.scopes ?? [],
    error,
  };
  listeners.forEach((listener) => listener());
};

export const getGitHubConnectionSnapshot = () => snapshot;
export const getGitHubConnectionRevision = () => revision;
export const subscribeToGitHubConnection = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const loadGitHubConnection = () => {
  if (snapshot.ready) return Promise.resolve();
  const expectedRevision = revision;
  loading ??= SecureStore.getItemAsync(key)
    .then((stored) => {
      if (revision !== expectedRevision) return;
      credential = stored
        ? gitHubCredentialSchema.parse(JSON.parse(stored))
        : null;
      publish();
    })
    .catch(() => {
      if (revision === expectedRevision)
        publish("Unable to read your GitHub connection. Please reconnect.");
    })
    .finally(() => {
      loading = undefined;
    });
  return loading;
};

const serializeWrite = (operation: () => Promise<void>) => {
  const result = writing.then(operation);
  writing = result.catch(() => {});
  return result;
};

export const saveGitHubConnection = (
  token: GitHubOAuthTokenSchema,
  profile: GitHubProfileSchema,
  expectedRevision = revision,
) =>
  serializeWrite(async () => {
    if (revision !== expectedRevision)
      throw new Error("GitHub connection changed. Please try again.");
    const nextCredential = gitHubCredentialSchema.parse({
      accessToken: token.accessToken,
      scopes: token.scopes,
      profile,
      expiresAt:
        token.expiresIn === null ? null : Date.now() + token.expiresIn * 1000,
      refreshToken: token.refreshToken,
      refreshTokenExpiresAt:
        token.refreshTokenExpiresIn === null
          ? null
          : Date.now() + token.refreshTokenExpiresIn * 1000,
    });
    await SecureStore.setItemAsync(key, JSON.stringify(nextCredential), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (revision !== expectedRevision)
      throw new Error("GitHub connection changed. Please try again.");
    revision += 1;
    credential = nextCredential;
    publish();
  });

export const disconnectGitHub = () => {
  // Invalidate in-flight browser/refresh/startup results before awaiting storage.
  revision += 1;
  return serializeWrite(async () => {
    await SecureStore.deleteItemAsync(key);
    credential = null;
    publish();
  });
};

export const getGitHubAccessToken = async (): Promise<string> => {
  await loadGitHubConnection();
  const current = credential;
  if (!current || !current.scopes.includes("repo"))
    throw new Error("Connect GitHub to use repository commands.");
  if (current.expiresAt === null || current.expiresAt > Date.now() + 30_000)
    return current.accessToken;
  if (
    !current.refreshToken ||
    (current.refreshTokenExpiresAt !== null &&
      current.refreshTokenExpiresAt <= Date.now())
  ) {
    throw new Error("Reconnect GitHub to renew repository access.");
  }
  const expectedRevision = revision;
  refreshing ??= (async () => {
    const { refreshGitHubAuthorization } = await import("./authorization");
    const token = await refreshGitHubAuthorization(current.refreshToken!);
    if (!token.scopes.includes("repo"))
      throw new Error("Reconnect GitHub to renew repository access.");
    await saveGitHubConnection(token, current.profile, expectedRevision);
    if (!credential || credential.accessToken !== token.accessToken)
      throw new Error("GitHub connection changed.");
    return token.accessToken;
  })().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
};
