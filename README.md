# Codaloud

**A coding workspace that goes wherever you do.** Codaloud is a mobile IDE for iOS and Android that brings a code editor, Git, an interactive terminal, and an AI assistant together on your phone.

Import a GitHub repository, open a file, describe the change you want, run the project's commands, review the diff, and commit your work—all from the same workspace. You can speak to the assistant or type an instruction, and use the editor directly whenever you want precise control.

I love programming and wanted to work on projects from anywhere. The mobile tools I tried never quite fit the way I wanted to code, so I built my own.

## Features

| Feature | What you can do |
| --- | --- |
| **Mobile code editor** | Edit multiple files with syntax highlighting, autocomplete, search, formatting, import organization, undo/redo, and diagnostics for supported languages. |
| **Coding keyboard** | Use a dedicated symbols row above the keyboard for brackets, punctuation, indentation, and other common coding characters. |
| **Projects and drafts** | Create local projects, import files or GitHub repositories, and write standalone drafts that you can copy into a project later. |
| **Git workflow** | Review file changes and diffs, stage work, create commits, manage branches, and fetch, pull, or push connected repositories. |
| **Voice commands** | Hold to speak or double-tap for hands-free conversation. Within a project, ask the assistant to explain or edit code, find files, open panels, or run commands. In drafts, the assistant works with the open draft. |
| **Text commands** | Switch the command bubble to text mode, or set your preference in Editor Settings. Typed requests use AI credits without starting an audio session. |
| **Floating command bubble** | Read responses, file results, and tool activity in one resizable, collapsible bubble above the editor controls. Implementation plans have their own review panel. |
| **Background agents** | Review and approve longer implementation plans, then follow task progress, file activity, and agent logs while continuing to use the app. |
| **Cloud terminal** | Run normal shell commands in an interactive Daytona sandbox dedicated to the project, including dependency installation, tests, and builds. |
| **Incremental file sync** | Transfer changed files between the device and sandbox, batch small downloads, verify file hashes, and report concurrent edit conflicts. |
| **Editor customization** | Adjust editor appearance, font, indentation, voice/text preferences, and which paths the AI or file sync may access. |
| **Subscriptions and credits** | View plans and balances, use RevenueCat purchase flows, restore purchases, manage subscriptions, and purchase eligible credit top-ups. |
| **Sandbox cleanup** | Deleting a project queues its Daytona sandbox for background deletion, with retry support when the device reconnects. |

Local projects and drafts remain on the device. AI, authentication, purchases, remote Git operations, and cloud terminals need their respective online services. Terminal use requires an eligible paid plan or trial and available credits.

## Run locally

This repository contains the mobile app, Expo API routes, a voice worker, a terminal gateway, and Trigger.dev tasks. The full development setup requires your own service credentials; there is no bundled anonymous demo backend.

**Use a native development build.** Expo Go does not include the custom workspace engine, voice, terminal, and purchase modules needed by Codaloud. The app targets iOS and Android; the web export packages backend API routes rather than a browser version of the app.

### 1. Install the prerequisites

- **Node.js 22.13+ within the Node 22 release line, or Node.js 24.3+.** These match the Expo SDK 57 / React Native 0.86 requirements. See the [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/).
- **pnpm 12.6.0**, pinned in `package.json`.
- **Git, Python 3, CMake 3.22+, and Ninja** for the native dependencies and workspace engine.
- **For iOS:** macOS, Xcode 26.4 or newer, Xcode Command Line Tools, CocoaPods, and an installed iOS Simulator runtime. Open Xcode once to finish its initial setup.
- **For Android:** Android Studio, its compatible JDK, Android SDK/NDK and CMake tools, and a running emulator or connected development device. Follow [Expo's local environment setup](https://docs.expo.dev/guides/set-up-your-environment/).
- Accounts and API credentials for the services listed in step 3, plus a Dev Tunnel that can forward HTTPS and WebSocket traffic.

The managed launcher uses `lsof` and Unix build tools. Use macOS for iOS development, and macOS or Linux for this Android launch workflow; install `lsof` if your Linux distribution does not include it.

If pnpm is not installed:

```sh
npm install --global pnpm@12.6.0
```

### 2. Clone and install

```sh
git clone https://github.com/Danieldkdao/codaloud.git
cd codaloud
pnpm install --frozen-lockfile
```

Run all subsequent commands from this directory. Installation prepares the local TypeScript compiler and downloads the pinned native dependencies. Allow the configured install scripts to run; skipping them can leave native frameworks or generated editor assets missing. The first installation and native build need a network connection and take longer than subsequent runs.

### 3. Configure your environment

Create a file named `.env` in the repository root and copy the template below into it. Replace every placeholder with your own configuration. `.env` is ignored by Git; do not commit it.

```dotenv
# Neon Postgres and authentication
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
BETTER_AUTH_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"

# Your tunnel must forward to Expo/API on local port 8081.
DEV_TUNNEL_URL="https://YOUR-TUNNEL-8081.use.devtunnels.ms"
BETTER_AUTH_URL="https://YOUR-TUNNEL-8081.use.devtunnels.ms"
EXPO_PUBLIC_BETTER_AUTH_URL="https://YOUR-TUNNEL-8081.use.devtunnels.ms"

# Forward the terminal gateway separately on local port 8787.
TERMINAL_PORT=8787
TERMINAL_WS_URL="wss://YOUR-TUNNEL-8787.use.devtunnels.ms/terminal"

# OAuth providers
GITHUB_CLIENT_ID="YOUR_GITHUB_CLIENT_ID"
GITHUB_CLIENT_SECRET="YOUR_GITHUB_CLIENT_SECRET"
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
APPLE_CLIENT_ID="YOUR_APPLE_SERVICES_ID"
APPLE_TEAM_ID="YOUR_APPLE_TEAM_ID"
APPLE_KEY_ID="YOUR_APPLE_KEY_ID"
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----"
APPLE_APP_BUNDLE_IDENTIFIER="com.codaloud.development"

# Background tasks: use the development key for local development.
TRIGGER_PROJECT_REF="proj_YOUR_PROJECT_REF"
TRIGGER_SECRET_KEY="tr_dev_YOUR_SECRET_KEY"

# Cloud terminal
DAYTONA_API_KEY="YOUR_DAYTONA_API_KEY"
DAYTONA_TARGET="YOUR_DAYTONA_TARGET"

# AI and live voice
OPENROUTER_API_KEY="YOUR_OPENROUTER_API_KEY"
LIVEKIT_URL="wss://YOUR_PROJECT.livekit.cloud"
LIVEKIT_API_KEY="YOUR_LIVEKIT_API_KEY"
LIVEKIT_API_SECRET="YOUR_LIVEKIT_API_SECRET"
DEEPGRAM_API_KEY="YOUR_DEEPGRAM_API_KEY"
ELEVENLABS_API_KEY="YOUR_ELEVENLABS_API_KEY"
FIRECRAWL_API_KEY="YOUR_FIRECRAWL_API_KEY"

# RevenueCat: public SDK keys belong in the app; secret keys stay on the server.
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY="YOUR_PUBLIC_IOS_OR_TEST_STORE_KEY"
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY="YOUR_PUBLIC_ANDROID_OR_TEST_STORE_KEY"
REVENUECAT_SECRET_API_KEY="YOUR_REVENUECAT_SECRET_API_KEY"
REVENUECAT_WEBHOOK_AUTH_TOKEN="YOUR_RANDOM_WEBHOOK_TOKEN_WITHOUT_BEARER_PREFIX"
```

The authoritative schemas are [server environment](src/data/env/server.ts) and [public environment](src/data/env/client.ts). The current schemas require the listed service credentials even if you are not immediately testing every feature; empty required values prevent startup. Both RevenueCat public key variables are required. For Test Store development, use your RevenueCat `test_` public SDK key for both platforms. For store builds, use the matching platform-specific keys instead.

Generate independent random values for the authentication secret and webhook token, for example by running this command once for each value:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use your own Neon database and Trigger.dev project. When building under a different app identifier, update `app.json`, Apple sign-in, and the corresponding store/RevenueCat configuration together. Never put server API keys or OAuth secrets into an `EXPO_PUBLIC_` variable.

Sign in to the Trigger.dev CLI once so the managed worker can access your project:

```sh
pnpm exec trigger login
```

Follow its browser login prompt. The CLI login and `TRIGGER_SECRET_KEY` serve different purposes; configure both.

### 4. Forward ports and register callbacks

Forward **both** local ports below through your Dev Tunnel host and make them accessible to the app and external service callbacks:

| Local port | Service | Environment setting |
| --- | --- | --- |
| `8081` | Expo/Metro and the API routes | `DEV_TUNNEL_URL` uses the tunnel's HTTPS origin. |
| `8787` | Interactive terminal gateway | `TERMINAL_WS_URL` uses the separate tunnel's `wss://` origin plus `/terminal`. |

There is no proxy or service on port `8082`. The launcher does not create or host the tunnels for you. Keep the tunnel host running alongside the development command. `DEV_TUNNEL_URL` must be an HTTPS origin with no additional path, query, or explicit port number.

Register these URLs in your provider dashboards, substituting the **8081 tunnel origin** for `https://YOUR-API-ORIGIN`:

| Provider | Callback or endpoint |
| --- | --- |
| GitHub OAuth | `https://YOUR-API-ORIGIN/api/auth/callback/github` |
| Google OAuth | `https://YOUR-API-ORIGIN/api/auth/callback/google` |
| Apple sign-in | Services ID domain: your API hostname; return URL: `https://YOUR-API-ORIGIN/api/auth/callback/apple` |
| RevenueCat webhook | `https://YOUR-API-ORIGIN/api/billing/webhook` |

For the RevenueCat webhook Authorization header, enter `Bearer YOUR_WEBHOOK_TOKEN`; store only the token in `.env`. Configure RevenueCat's `paid` entitlement, `plans` and `topups` offerings, products, and paywalls before testing billing. See [RevenueCat setup](docs/revenuecat-setup.md) for the catalog and store-specific details, and [development tunnels](docs/dev-tunnel-setup.md) for the existing workspace's tunnel configuration.

Changing `.env` does not change OAuth callbacks or webhooks in provider dashboards. The development launcher passes the tunnel origin to both authentication URL variables in its child processes.

### 5. Apply database migrations

```sh
pnpm db:migrate:cloud
```

This applies the committed migrations, including account and billing tables, to the Neon database selected by `DATABASE_URL`. Local SQLite migrations run automatically in the mobile app. You do not need to generate new migrations just to run an existing checkout.

### 6. Build and launch one platform

For the first iOS build:

```sh
pnpm ios
```

Select your simulator or connected device when prompted. The command builds the native workspace libraries, prepares the terminal framework, and builds and installs the app.

For the first Android build, start your emulator or connect your development device, then run:

```sh
pnpm android
```

**Run only one of `pnpm ios`, `pnpm android`, or `pnpm dev` at a time.** Each launches Expo, the LiveKit voice worker, the terminal gateway, and Trigger.dev's development worker. A second `pnpm tasks:dev` process is unnecessary for this setup. Keep the command running while using the app; Ctrl+C stops the managed services.

After the native development app is installed, use this for everyday JavaScript/TypeScript development and reopen the installed app:

```sh
pnpm dev
```

Stop the previous command before switching to `pnpm dev`. Rebuild with `pnpm ios` or `pnpm android` when native dependencies, native modules, or build configuration change. Restart the managed development command after changing `.env` or worker code so every service loads the new configuration.

### 7. Confirm the setup works

With the development command and tunnels running, open these URLs using **your own tunnel hostnames**:

- `https://YOUR-TUNNEL-8081.use.devtunnels.ms/api/auth/get-session` should return JSON. Without a session, an empty/null session is expected.
- `https://YOUR-TUNNEL-8787.use.devtunnels.ms/health` should return `ready`.

In the app, sign in, connect GitHub, import a small repository, and open a file. Try editing and reviewing a diff first. Then test a typed request, a voice request, and a simple terminal command such as `pwd`. Use a sandbox/Test Store purchase when checking billing.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Missing environment variables | Fill every required value from step 3 and restart the development command. Check the server/public schemas for the reported variable. |
| Tunnel returns `502` | Confirm the matching local service is running on `8081` or `8787` and that the tunnel host forwards that exact port. |
| Tunnel redirects to Microsoft sign-in | The tunnel is not accessible anonymously; external webhooks cannot complete a browser login. Check tunnel access settings. |
| “Metro/voice worker/terminal gateway is already running” | Stop the earlier managed command with Ctrl+C before starting another. The worker also uses local port `8089`; it does not need a public forward. |
| OAuth callback or webhook fails | Match the provider dashboard URLs to your current API tunnel. For RevenueCat, match the Authorization header token to the server environment value. |
| Native module missing or Expo Go cannot open the app | Install a native development build with `pnpm ios` or `pnpm android`. |
| iOS build reports missing Ghostty/SQLite artifacts | Run `pnpm ios` through the managed launcher so native assets are prepared. If its framework restoration fails, follow the reported `pnpm rebuild expo-libghostty` instruction and retry. |
| Editor reports missing C++ or Swift headers | Follow [native editor setup](docs/research/native-editor-setup.md) to generate compiler/indexing context. Open the CocoaPods workspace for iOS. |
| Terminal build prints `Killed` | It may have exhausted sandbox memory. Check exit status and OOM events; see [terminal runtime](docs/terminal-runtime.md). |
| Plans or top-ups do not load | Check RevenueCat SDK keys, offerings, products, and store configuration. Public SDK keys and server secret keys are different. |

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the full local service stack for an already installed development app. |
| `pnpm ios` / `pnpm android` | Build and launch a native development app with the local service stack. |
| `pnpm dev:app` | Start only Expo; useful when you intentionally manage the other services separately. |
| `pnpm tasks:dev` / `pnpm tasks:deploy` | Run a standalone Trigger.dev worker or deploy background tasks. |
| `pnpm export:api` | Export Expo API routes for deployment; this does not build the mobile app. |
| `pnpm db:migrate:cloud` | Apply existing cloud database migrations. |
| `pnpm db:generate:cloud` / `pnpm db:generate:local` | Generate migrations after changing the corresponding schema. |
| `pnpm generate:typescript` | Regenerate the bundled local TypeScript compiler and standard libraries. |
| `pnpm configure:native-editor` | Generate C++ editor indexing configuration. |
| `pnpm lint` | Run Expo ESLint. |
| `pnpm test` | Prepare the TypeScript/native host assets and run the Vitest suite; requires native build tools. |
| `pnpm exec tsc --noEmit` | Check application TypeScript types. |

## How it works

| Area | Technology |
| --- | --- |
| Mobile app and navigation | React Native, Expo SDK 57, Expo Router |
| Code editor | CodeMirror in an Expo DOM/WebView |
| On-device workspaces | Native C++ workspace engine, libgit2, Expo SQLite |
| Accounts and cloud data | Better Auth, Neon Postgres, Drizzle |
| AI requests | OpenRouter and the Vercel AI SDK |
| Live voice | LiveKit, Deepgram transcription, ElevenLabs speech |
| Remote execution | Daytona sandboxes and a WebSocket terminal gateway |
| Background work | Trigger.dev |
| Purchases and credit billing | RevenueCat and a server-side credit ledger |

Local Git and terminal Git currently keep independent repository metadata; raw `.git` files are not mirrored by ordinary file sync. See [terminal runtime](docs/terminal-runtime.md) for sync limits, conflict handling, sandbox resources, and cleanup behavior.

## Project background and next steps

I planned the product, researched the stack, and guided the decisions. Codex built and executed the implementation with me. The hardest parts were making local workspaces and cloud execution feel like one workflow, designing a usable interface for a small screen, adding live voice sessions, choosing a credit model, and bringing useful diagnostics to multiple languages. Finishing a working app in under a month taught me a lot about those tools and about directing an AI-assisted development workflow.

The next goals are broader language support, a more consistent interface, on-device Apple model support, a terminal that can run locally without cloud infrastructure, iPad support, and an App Store release.
