# Project terminal runtime

The iOS and Android workspace stays on the device. A project's optional local
`sandbox_id` points to a private Daytona sandbox for command execution. Opening
the terminal or running an agent command starts or resumes that sandbox and
syncs changed files in both directions. The device and sandbox each keep a
per-file SHA-256 manifest; two concurrent edits to the same path remain
untouched and are reported as conflicts.

## Services

- `pnpm dev` starts Expo, the voice worker, and the terminal gateway together.
- A deployed API export must include `/api/terminal` and have the Daytona
  credentials and the same `BETTER_AUTH_SECRET` as the gateway.
- Run `pnpm terminal:start` as a persistent Node service with the normal server
  environment. `TERMINAL_PORT` defaults to `8787`; its `/health` endpoint
  returns `ready`.
- Put the gateway behind TLS and set `TERMINAL_WS_URL` on the API service to its
  public `wss://.../terminal` address. Production API requests do not infer a
  gateway URL. Do not expose Daytona credentials to the app.

The API authenticates each request and verifies that the sandbox belongs to
the signed-in user, device, and project. It issues a short-lived signed ticket
for a WebSocket connection. The gateway rechecks ownership before attaching
the PTY. Keep `BETTER_AUTH_SECRET` identical on both services.

## Workspace behavior

The phone uploads local edits before a run. Shell and agent changes are pulled
back after output settles or a command completes. A Run action uses the PTY so
prompts, standard input, and Ctrl+C work in the visible panel. Files in
`node_modules`, `.git`, build output, virtual environments, and other generated
directories stay sandbox-local; dependency manifest and lockfile changes sync.
Each file is limited to 32 MiB and a workspace to 5,000 syncable files.

Daytona does not enable automatic deletion by default. Codaloud explicitly sets
auto-stop to 30 idle minutes, auto-archive to seven days continuously stopped,
and auto-delete to 30 days continuously stopped when it creates a sandbox. A
missing sandbox is recreated from the local project. The project stays available
offline; terminal execution requires network access to the API, gateway, and
Daytona.
