# Development tunnels

The development launcher uses Expo directly on **8081** and the terminal gateway directly on **8787**. There is no proxy and no listener on 8082. Keep both public forwards running in your tunnel host.

The ignored `.env` file contains:

```dotenv
DEV_TUNNEL_URL=https://5jfkq6mx-8081.use.devtunnels.ms
BETTER_AUTH_URL=https://5jfkq6mx-8081.use.devtunnels.ms
EXPO_PUBLIC_BETTER_AUTH_URL=https://5jfkq6mx-8081.use.devtunnels.ms
TERMINAL_WS_URL=wss://5jfkq6mx-8787.use.devtunnels.ms/terminal
```

Run **one** of `pnpm dev`, `pnpm ios`, or `pnpm android`. Each starts Expo, the voice worker, the terminal gateway, and Trigger.dev with these URLs. `pnpm ios` also builds and installs the native app. Stop that terminal with Ctrl+C before restarting; the launcher rejects occupied service ports rather than silently using another server's configuration. No tunnel SDK, authtoken, or CLI is started by the application.

After the servers start, the API's `/api/auth/get-session` must return JSON, and the terminal's `https://5jfkq6mx-8787.use.devtunnels.ms/health` must return `ready`. A 502 before the local services start means the tunnel has no upstream listener. A Microsoft sign-in redirect means tunnel access is still private.

Register these **development** callback URLs in their respective provider consoles if they still contain an older development domain:

- GitHub OAuth callback: `https://5jfkq6mx-8081.use.devtunnels.ms/api/auth/callback/github`
- Google authorized redirect URI: `https://5jfkq6mx-8081.use.devtunnels.ms/api/auth/callback/google`
- Apple Services ID domain: `5jfkq6mx-8081.use.devtunnels.ms`; return URL: `https://5jfkq6mx-8081.use.devtunnels.ms/api/auth/callback/apple`
- RevenueCat development webhook: `https://5jfkq6mx-8081.use.devtunnels.ms/api/billing/webhook`, retaining the configured Authorization header.

These settings belong to the external provider accounts; updating `.env` does not update their consoles. Preserve production callbacks and webhooks. Native Apple sign-in also uses the configured bundle identifier.

Microsoft documents support for HTTPS and WSS forwarding in [Dev Tunnels security](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/security). JSON API requests bypass the browser interstitial. OAuth browser sessions may display it once; continue to the development endpoint when prompted. See [hosting an existing tunnel](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/cli-commands) for tunnel host configuration. Use deployed API and gateway URLs for release builds.
