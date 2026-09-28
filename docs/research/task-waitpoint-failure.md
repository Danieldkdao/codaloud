# Task failure with an outstanding device wait

Investigated September 22, 2026. Versions: Trigger.dev CLI and SDK 4.6.3, AI SDK 7.0.107, Node 24.14.0. The development CLI was running from this repository through `pnpm dlx trigger.dev dev`; the installed `pnpm tasks:dev` script also uses CLI 4.6.3. No CLI restart or dependency change was needed for the fix; the existing watcher loaded it.

## Evidence and reproduction

The original run, `run_06gcj1nc4jnnjkpivck5heqp01`, ended with `TASK_RUN_STALLED_EXECUTING` after five minutes without heartbeats. Its trace contains an earlier, distinct failure: `workspace-task.ts` threw “A tool failed” after 3.8 seconds while `wait.forToken()` remained incomplete and the browse-folder command remained in metadata. The dashboard's connected-CLI indicator did not establish the health of that individual task attempt.

The application defect is reproducible without a phone or network: the real AI SDK receives two tool calls in one model response. Its tool executor starts both calls concurrently. Our `busy` guard throws for the second call while the first is still awaiting a device acknowledgement. The stream consumer immediately throws on `tool-error`, returning from the task without waiting for the first action or its metadata cleanup. `parallelToolCalls: false` is not a substitute for execution ordering; the real provider also returned overlapping calls during this investigation.

Before the fix, this command failed five added scenarios: successful overlapping calls, a mutation followed by a read, device failure, wait timeout, and cancellation. The failure path could return before any acknowledgement and with an outstanding device command:

```sh
node node_modules/vitest/vitest.mjs run src/features/agent/tests/workspace-task.test.ts
```

A real development run with synthetic device IDs, `run_06gcj51gn3tr8lkmgjepr11601`, reproduced the early tool error and unfinished wait. That run eventually reported `FAILED`, not the original heartbeat-timeout status. Isolated timing probes that threw while a real waitpoint was active also did not reproduce `TASK_RUN_STALLED_EXECUTING`. Thus the overlapping-tool failure and abandoned wait are confirmed; the exact additional condition behind the original missing-heartbeat timeout is not established. Do not treat every future heartbeat timeout as this application bug.

## Fix

`workspace-task.ts` now queues tool execution within each run, including web tools, so only one action owns the command metadata and waitpoint at a time. Each action sees the revision acknowledged by the preceding mutation. After an error or cancellation, queued actions cannot start. On a stream error, task teardown drains any already-started operation before returning; a disconnected device still has the existing five-minute waitpoint deadline. Normal error handling clears the command metadata. Tool failures retain the failing tool name and original error as their cause.

This does not retry mutations, increase timeouts, change permissions, or assume a suspended phone can execute local work.

## Verification

- The agent/Trigger test suite passed 42 tests across 10 files; TypeScript passed. Nine workspace-task tests cover the real AI SDK loop, sequential acknowledgements, mutation revision propagation, device failure, timeout, cancellation before and during a wait, and a web-tool failure following a device action.
- Fixed development run `run_06gcj5k7chtf4a29vcorg3er01` completed `listFiles` and `gitStatus` with synthetic acknowledgements and no leftover command.
- Failure-injection run `run_06gcj5t1351vnc0bsprc201m01` reported `FAILED` after the first rejected device action, cleared its command, and did not execute the next action.
- End-to-end simulator run `run_06gcj63cq8gg0roiida9pl3k01` completed through the app's existing authenticated API, task subscription, real local folder/Git reads, acknowledgement API, and final completed state. The project revision was unchanged. No file edits, commits, pushes, or fetches were requested or performed by that diagnostic.
- Temporary cloud diagnostic task and debugger script were removed. Existing user-started CLI, Expo, and voice servers were left running.

To repeat the cloud checks against an already running development CLI:

```sh
node --env-file=.env scripts/diagnose-task-waitpoints.mjs --cloud
node --env-file=.env scripts/diagnose-task-waitpoints.mjs --cloud --device-failure
```

These create development runs and incur a model call. They use random synthetic project/device IDs and acknowledge only read-only tool names with fixture data. They do not execute on a phone or touch repositories. The deterministic regression test above guarantees overlapping model calls; cloud output remains provider-dependent. Unfinished diagnostic runs are cancelled after the script's deadline.

## Follow-up: rejected root-folder input

A subsequent user-provided trace exposed a separate failure: `AI_InvalidToolInputError` for `listFiles` with `{"path":"."}`. The project directory validator deliberately rejects dot segments; the project-root representation is the empty string. This call failed AI SDK validation before a device command was dispatched, not because of the previous overlapping-call bug.

The real AI SDK task-loop regression reproduced this exact failure for both `.` and `./`, while empty, omitted, and normal subfolder paths passed. The task now uses AI SDK 7's `repairToolCall` hook to translate only these two exact `listFiles` root aliases to `""`. It preserves the tool-call ID and other fields, and the SDK revalidates the repaired input against the unchanged strict validator before execution. This adds neither a model request nor a task/mutation retry. The tool and path descriptions now explicitly show the canonical root argument.

After this follow-up, all 58 agent/Trigger tests across 10 files and TypeScript passed. The integration tests verify canonical device dispatch and preserved call IDs, reject absolute/traversal/other dot-segment paths and extra fields, and confirm the repair does not apply to readFile or mutation inputs. These exercise the task loop, not standalone schema tests. No live create/commit/push workflow was replayed for this follow-up.

The configured model remains `deepseek/deepseek-v4-flash`. This case alone does not establish which model is more reliable; no cross-model benchmark was performed. Any future comparison should measure unrepaired valid-input rate, completed workflows, latency, and cost on the same representative tool scenarios with synthetic device results. Keep validation and safe input handling regardless of model choice.

## References

- [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling): execution errors are emitted as tool-error stream parts. Installed AI SDK 7.0.107 `execute-tools-from-stream.ts` invokes model tool calls concurrently with `Promise.all`.
- The same installed SDK's tool-call repair documentation and `parse-tool-call.ts` confirm that repaired inputs are validated again once before execution; this is the boundary used by the root-alias mitigation.
- [Trigger.dev wait tokens](https://trigger.dev/docs/wait-for-token): waitpoints pause tasks pending a result or timeout; verified against the installed SDK's bundled documentation.
- [Trigger.dev troubleshooting](https://trigger.dev/docs/troubleshooting#task-run-stalled-executing): missing heartbeats can also reflect CLI/process availability or an unresponsive event loop.
