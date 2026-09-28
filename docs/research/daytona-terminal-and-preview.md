# Daytona terminal, command streaming, and app previews

Researched September 26, 2026 against Daytona's current official documentation and Codaloud's checked-out application. No live sandbox was created and no provider credentials were used. This is a capability and integration review; no application code changed.

## Summary

Daytona already supplies the core primitives for the proposed experience:

- Run ordinary shell commands inside an isolated sandbox.
- Keep command state and long-running background processes in sessions.
- Stream real-time output from session commands.
- Open a bidirectional PTY terminal over a WebSocket, including input and terminal resize.
- Generate authenticated preview URLs for HTTP servers listening on a sandbox port.

This is enough to build a terminal panel, stream build/dev-server output, let an agent issue commands, and preview a running app. It does not mean every language or framework is preinstalled. The generic shell can run whatever tools are installed in that sandbox image (or successfully installed there); the language-specific `codeRun`/`code_run` helper officially covers Python, JavaScript, and TypeScript. A terminal is the broad execution interface, not a guarantee that all compilers, package managers, network destinations, or system dependencies are available.

## Three execution paths

| Need | Daytona interface | Behavior |
| --- | --- | --- |
| Short command / build / test | `sandbox.process.executeCommand(command, cwd?, env?, timeout?)` | Waits for completion, returns exit code and output (`result` / `artifacts.stdout`). Not the interactive terminal stream. |
| Background command with streamable output | Create a session, then `executeSessionCommand(sessionId, { command, runAsync: true })`; follow its command logs | Preserves shell/session state, supports long-running processes, and provides stdout/stderr streaming callbacks through `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)`. |
| Interactive shell | `createPty({ id, cwd, envs, cols, rows, onData })` | A real PTY with bidirectional input/output, suitable for a terminal emulator. The SDK handle supports `sendInput`, `wait`, `resize`, and `disconnect`; `connectPty` can reconnect to a session. |

Sources: [TypeScript Process reference](https://www.daytona.io/docs/en/typescript-sdk/process/), [Process and Code Execution guide](https://www.daytona.io/docs/process-code-execution), [TypeScript PTY reference](https://www.daytona.io/docs/en/typescript-sdk/pty/).

The distinction matters for the UI. Use a PTY for a shell the person types into. Use session commands for an agent task or a specific build action with a clear running/completed status. A streamed build log is useful, but it is not a shell: there is no general keystroke input there unless the app uses the interactive command-input endpoint or a PTY.

## TypeScript SDK notes

The official package is `@daytona/sdk`; the app currently declares `^0.210.0`. Create/retrieve the `Sandbox` on a trusted server using the SDK, then call its `process` methods. Keep the Daytona API key on the server. The command string is executed by a shell, so app-generated commands should be built from trusted templates and validated inputs; an agent terminal intentionally grants broad command capability within that sandbox.

`executeCommand` is synchronous from the caller's perspective: it resolves when the command exits or its timeout terminates it. Use a bounded timeout for request/response actions. For work that should outlive an HTTP request, create a named session and execute asynchronously, retain the returned `cmdId`, and stream/read logs using that session + command ID. `getEntrypointLogs` is a separate method for the sandbox's configured entrypoint, not arbitrary commands.

PTY output is delivered as `Uint8Array` chunks. The app needs to decode and relay those chunks without assuming chunk boundaries match lines or UTF-8 characters. PTY dimensions should follow the visible terminal panel. Always disconnect/kill sessions when no longer needed, and reconnect using the stable PTY session ID when the UI or network reconnects.

Sources: [Process reference: PTY, sessions, and log methods](https://www.daytona.io/docs/en/typescript-sdk/process/), [PTY guide](https://www.daytona.io/docs/en/pty/), [TypeScript PTY types](https://www.daytona.io/docs/en/typescript-sdk/pty/).

## Previewing an app

Daytona previews HTTP services listening on ports 1–65535. For a user's app, a server command such as `npm run dev -- --host 0.0.0.0` can run in a persistent session; once the server is listening, request a preview URL for its port.

- `getPreviewLink(port)` returns a standard URL plus a separate token. Private previews require the `x-daytona-preview-token` header. The standard token is sandbox-wide and powerful: Daytona warns it can access any sandbox port, including toolbox and terminal control ports. Never expose or share this token.
- `getSignedPreviewUrl(port, expiresInSeconds)` returns a port-scoped, expiring URL with auth embedded. It is designed for users without custom headers and for embedded previews. Expiry defaults to 60 seconds; docs recommend explicitly choosing a longer suitable duration (up to 24 hours), and the signed token can be revoked.
- First browser visits may show Daytona's warning page. Skipping it requires a special request header, Tier 3, or a custom proxy, so an iframe/app preview experience may need a custom preview proxy or should account for the warning.

Sources: [Daytona Preview guide](https://www.daytona.io/docs/en/preview/), [TypeScript Sandbox preview methods](https://www.daytona.io/docs/en/typescript-sdk/sandbox/).

The app preview is an HTTP preview, not an app-store/native simulator. A web app is a natural fit. Native mobile apps need an additional emulator/device workflow. The app must detect the port (convention/configuration or user choice), handle the dev server becoming ready, refresh/reissue expiring preview access, and stop the process when appropriate.

## What the current app has

- `@daytona/sdk` is already in [package.json](/Users/danieldao/Desktop/codaloud/package.json).
- [temporary-execution.ts](/Users/danieldao/Desktop/codaloud/src/services/daytona/temporary-execution.ts) creates an ephemeral private TypeScript sandbox, uploads a bounded source snapshot, executes one command with a timeout, downloads explicitly requested output files, and deletes the sandbox. This is appropriate for disposable run/check operations, not a persistent terminal or live preview.
- The Code screen is a working editor with project-file saving and agent integration; the Agent screen is the task/activity view. No app-facing persistent PTY, streaming terminal, or sandbox preview implementation was found in the inspected paths.
- The existing product design document explicitly treats interactive terminal and app preview as deferred capabilities. They can be added later without creating a fifth workspace destination: terminal output can be an Agent task/detail surface or a collapsible Code panel, and preview can be a Code view.

Sources: [Code screen](/Users/danieldao/Desktop/codaloud/src/app/projects/%5BprojectId%5D/code.tsx), [Agent screen](/Users/danieldao/Desktop/codaloud/src/app/projects/%5BprojectId%5D/agent.tsx), [workspace UI options](/Users/danieldao/Desktop/codaloud/docs/design/workspace-ui-options.md).

## Recommended integration shape

1. Reuse the project's persistent sandbox and project root for terminal and preview work. Keep the existing ephemeral snapshot runner for isolated execution tasks; do not turn every terminal/preview action into a new sandbox and re-upload.
2. Add server-owned operations for create/reconnect PTY, input, resize, disconnect, session command start/stop, and preview-link issue/revoke. Bind every operation to the authenticated user, owned project, and stored sandbox identity. Never accept a client-supplied sandbox ID, API key, or arbitrary preview token as authority.
3. Relay PTY WebSocket frames and log events through an authenticated backend transport. Verify the chosen deployment runtime supports bidirectional WebSocket upgrade/streaming; an ordinary short-lived JSON API route is not by itself enough for a terminal. If backend WebSocket relay is unavailable, evaluate a narrowly scoped signed connection/proxy design rather than returning Daytona's sandbox-wide token to the phone.
4. Treat output as structured events (stdout/stderr or PTY bytes, timestamps, command/session IDs, completion/exit code) and let the UI animate arrivals. Keep the animation cosmetic: buffer and render chunks safely, retain text selection/copy, and avoid losing output during reconnects.
5. Start `npm run dev` (or the project's declared command) as a background session, stream readiness output, and only then issue a signed preview URL for the detected port. Stop or expire processes/preview access with clear lifecycle rules.
6. Define the supported language/tool matrix from the actual sandbox image and network tier. A terminal allows additional installed tools, but `npm install`, package downloads, native compilers, and arbitrary outbound calls depend on image contents, organization network policy, resource limits, and timeouts.

### Practical scope recommendation

The user's vision is technically sound. Daytona already has the command, PTY, streaming, and preview building blocks; the main product work is secure transport, a terminal panel, sandbox lifecycle ownership, and preview UX. Describe support as “run commands and languages available in your project sandbox,” plus explicitly maintained first-class toolchains. Do not promise “any language” solely because a terminal exists.

No tests were run because this was documentation research only. The current docs establish SDK capabilities but do not establish Codaloud's hosting support for a persistent bidirectional socket, the exact packages installed in its persistent sandbox image, actual npm dev-server readiness timing, or iframe behavior in the target native WebView; those require implementation/deployment validation.
