---
name: review-change-flows
description: Organize code changes into a flow-based review guide that introduces prerequisite definitions and dependencies before their consumers, with tests last in each group. Use when the user asks how to review a diff, understand how changed components connect, or group changes for review. This produces a review roadmap rather than a correctness audit.
---

# Review Change Flows

Help the user review a change set by first understanding the definitions and dependencies each file relies on, then following how the feature works: where data originates, who owns state, which components pass it along, and how actions produce visible results.

## Establish the change set

Use the user's specified commit, branch, PR, or file scope. For ongoing local work with no explicit base, inspect the staged and unstaged changes against HEAD, plus untracked source files, and state that scope. If the working tree is clean, use the clearly identified commit or PR from context; ask for a base if none is identifiable.

Inspect the actual diff and new files before grouping them. Include changes from earlier turns within the selected scope, not just the latest edit. Distinguish the whole diff from changes known to be yours; do not claim authorship based only on Git status. Account for added, modified, renamed, and deleted files. Read relevant callers or types when needed to verify relationships; identify unchanged context files as such.

## Trace and group the flows

Find the user actions or system operations that explain the changes. For each flow, identify the applicable parts:

- Entry point or trigger.
- Data source and state owner.
- Props, context, hooks, callbacks, requests, or persistence boundaries that carry data and events.
- Consumers and the visible result or side effect.
- Shared components and tests that support the flow.

Group files by these relationships, rather than alphabetically or solely by directory or file type. Give each changed file a primary home. Cross-reference a shared hub when another flow reaches it instead of repeating its full explanation. Keep supporting changes such as configuration, generated files, and lockfiles with the feature they enable, or in a clearly labeled supporting group when they span flows.

## Order prerequisites before consumers

Prioritize understanding prerequisites over runtime data or event order. Before ordering a file, inspect its imports, called functions, and surrounding composition to identify the definitions and behavior the reader needs first. Trace those dependencies back to the foundational files, then work toward their consumers.

- Introduce relevant types, schemas, interfaces, and constants before the code that uses their definitions.
- Introduce library functions, utilities, and helpers before their callers. Name the relevant symbols and link to their defining files so their origin is clear.
- Introduce context providers, state owners, wrappers, and parent composition before consumers whose behavior depends on that setup, even when the consumer does not directly import the surrounding file.
- Include unchanged prerequisite files when they supply necessary context, clearly marked as unchanged. Limit these references to the symbols or sections needed to understand the change.
- Place tests last within each group, after the definitions and implementation they verify.

Choose the starting file from the actual dependencies rather than a fixed filename or category order. Shared prerequisites can form an opening group that later groups reference. If dependencies are circular or one file both defines a contract and consumes an implementation, introduce the contract or setup section first, then return to the dependent section with an explicit cross-reference. The reading order is ready when each meaningful prerequisite is introduced before its consumer or has an explained cross-reference.

## Present the review guide

Start with the scope and a short suggested sequence of review passes. Scale the number of groups to the diff; a small edit may need only one group.

For each group, provide:

- A concrete name describing its behavior or purpose.
- A brief explanation connecting prerequisite definitions and setup to the data or events that move between files. Name the important types, functions, state, values, or callbacks when that clarifies the connection.
- A vertical bullet list in the prerequisite-first reading order established above. Put exactly one file in each bullet, starting with its clickable Markdown link, followed by one or two short sentences describing the concrete change in that file and what the reader should inspect. State what was added, modified, renamed, or removed; for unchanged prerequisites, explain the relevant context instead.
- Use this entry format: `- [file.ts](/absolute/path/file.ts): Added the validation that rejects stale updates before saving.` Use absolute paths for local links and verified line anchors when helpful; identify old paths explicitly for deleted files.
- Give supporting files, tests, lockfiles, configuration, and assets their own linked, annotated bullets too. Keep the reading order top-to-bottom; do not replace the entries with tables, arrow chains, inline lists of filenames, or bundled paths.
- The related tests as the final entries in the group, naming the behavior they verify, and one useful review question for substantial flows.

Call out the few integration points that deserve the most attention. Explain meaningful scope limits, such as demo state, a visual-only control, or an event that stops before persistence. Distinguish tests read from tests actually run. Use a compact diagram only when it makes branching or shared state easier to follow.

Before finishing, reconcile the guide against the changed-file inventory so every changed file has its own linked, annotated bullet in a primary group. Verify that each description names the actual change rather than merely restating the filename, and that tests remain last within their group. Describe final behavior rather than replaying the implementation history. Deliver the guide in the conversation unless the user requests a document. Keep the work read-only unless separately asked to modify code, create commits, or perform a correctness review.
