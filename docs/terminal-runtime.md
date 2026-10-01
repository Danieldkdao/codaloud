# Project terminal runtime

The iOS and Android workspace stays on the device. A project's optional local
`sandbox_id` points to a private Daytona sandbox for command execution. Opening
the terminal or running an agent command starts or resumes that sandbox and
syncs changed files in both directions. The device and sandbox each keep a
per-file SHA-256 manifest; two concurrent edits to the same path remain
untouched and are reported as conflicts.

## Services

- `pnpm dev` starts Expo, the voice worker, the terminal gateway, and Trigger.dev's
  development worker together.
- Development uses two public Dev Tunnel ports: Expo/API on `8081` and the
  terminal gateway on `8787`. Set its `wss://.../terminal` URL as `TERMINAL_WS_URL`.
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
prompts, standard input, and Ctrl+C work in the visible panel. Generated folders
stay sandbox-local by default. Editor Settings can explicitly allow dependency
folders such as `node_modules` to sync. Raw `.git` metadata is excluded. The
workspace limit is 100,000 syncable files. Files normally have a 32 MiB limit;
explicitly selected paths support up to 128 MiB per file.

Opening the terminal starts the PTY before syncing finishes. Sync progress shows
checking, uploading, downloading, and verification phases while commands remain
available. The terminal heading opens a native project menu for Files, Git, and
Agent, since the expanded terminal covers the bottom dock. These workspace routes
use Expo's JavaScript stack with modal transitions and Done controls, keeping the
editor attached. Native modal presentations stalled in the tested iOS 27 session
even though JavaScript navigation state changed. Editor refreshes only reload
open documents, rather than creating versions for downloaded dependencies.

Small downloads use one binary request for up to 256 files with an 8 MiB payload
budget and three concurrent download workers. Files that exceed a batch's remaining
budget are regrouped immediately; only individually oversized files use the large-file
fallback. Every file is checked against its
manifest hash before writing, and concurrent local edits are preserved. Native
file scans and JavaScript hashing yield to UI events between chunks. Transfer
requests time out after three minutes, including response-body reading; retrying
reconciles files already copied instead of overwriting conflicting edits.

Each terminal connection creates a fresh PTY in that project's
`codaloud-workspace` directory. Closing the connection kills that PTY; files
and installed tools remain in the persistent sandbox. A project has its own
private sandbox, so other projects' files are not mounted there. Daytona's PTY
`cwd` is a starting directory, not a directory jail: the shell can still read
other accessible paths in its sandbox. A strict workspace-only filesystem view
would require an OS-level restricted runtime, not shell command filtering.

Daytona does not enable automatic deletion by default. Codaloud explicitly sets
auto-stop to five idle minutes, auto-archive to seven days continuously stopped,
and auto-delete to 30 days continuously stopped when it creates a sandbox. A
missing sandbox is recreated from the local project. The project stays available
offline; terminal execution requires network access to the API, gateway, and
Daytona.

## Project deletion

Deleting a project saves its sandbox ID, project ID, device ID, and signed-in
account in a persistent device queue before removing local metadata. The UI
does not wait for Daytona. If local deletion fails, cleanup is cancelled; a
request cannot delete a sandbox while its project still exists locally.

The app submits pending cleanup when online and active, on startup, after
reconnecting, and every 30 seconds. Requests for another account wait until the
original account signs in again. An offline deletion remains queued across app
restarts. The device removes a request only after an authenticated
`DELETE /api/terminal` acknowledges a durable Trigger.dev job, or confirms that
the sandbox is already missing. Handoffs time out after 15 seconds and retry.

Cleanup is available on every plan and does not consume credits. The API checks
all three sandbox ownership labels before enqueueing. The
`delete-project-sandbox` task checks them again, deletes without starting the
sandbox, and retries transient failures up to ten attempts. Missing sandboxes
count as success; ownership mismatches stop permanently. The task queue permits
two concurrent deletions and duplicate handoffs use a 24-hour idempotency key.

Development uses the worker launched by `pnpm dev`, with task retries enabled.
For production, deploy the task with `pnpm tasks:deploy` and configure the worker
environment with the existing server credentials, including Daytona. Once
Trigger.dev accepts a job, cleanup continues independently of the app. A job
that exhausts its retries remains visible as failed in Trigger.dev for inspection
and replay; the app's queue covers handoff failures, not exhausted worker jobs.

## Sandbox resources

New terminal sandboxes use Daytona's `daytona-medium` snapshot: 2 vCPUs,
4 GiB of RAM, and 8 GiB of disk. Existing sandboxes are resized to the same CPU
and memory allocation before use when the deployment supports resizing; live
increases preserve the running terminal. If Daytona returns `Cannot POST .../resize`,
the existing workspace retains its original resources. Import the repository as
a new project to get the medium snapshot; the original project stays available.
The interactive PTY has no per-command timeout. A build that prints `Killed`
can have exceeded the sandbox's memory limit; check its exit status and cgroup
`memory.events` for `oom_kill` before attributing it to a timeout.

## Git metadata

Device Git and terminal Git currently have independent repository metadata. A terminal workspace without a repository needs `git init` or a separate clone before advanced Git commands can run. Cloud commits, branches and staging do not appear in the device Git UI automatically. Blindly merging live index, refs and object files can corrupt repository state; sharing history requires a Git-aware bridge rather than ordinary file sync.
