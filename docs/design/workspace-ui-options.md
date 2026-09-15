# Codaloud: three complete UI directions

Prepared September 15, 2026. Status: design proposals, not implemented or device-tested.

## Read this first

Recommendation: **Visible Tabs** offers the clearest everyday workflow. **Contextual Dock** is the closest evolution of the current implementation. **Focus + Tools** protects the most editor space, with a deliberate extra tap for manual tools.

These are three navigation and interaction systems, not three color themes. All preserve Codaloud's current cream, forest-green, and sage theme, readable body text, central microphone, native iOS/Android scope, and the four workspace destinations: Files, Code, Git, Agent. The main Projects/Drafts/Account navigation disappears inside a project.

The boards show three representative states per direction. The feature maps below specify the complete experience, including screens not drawn. These are concept illustrations, not pixel-exact specifications. Known illustration discrepancies: Visible Tabs shows two checked files beside “Commit 3 files”; the implementation must always use the selected count. Contextual Dock's repository menu illustrates both Publish and remote links together; actual visibility is conditional, as specified below. Active capture must have an explicit listening/stop treatment, beyond the illustrative mic glyph. Disabled Send state must reflect whether a request can actually be submitted.

## Source and current-state evidence

Requirements: [Codaloud in Notion](https://app.notion.com/p/3d2b3d6d3d6f809b9c82e98a68e01be1), fetched September 15, last edited September 15, 2026. The fetch exposed no truncation or unknown-block warnings. Read the complete requirements including the newer Git inventory and future-work boundaries. The attached workspace image was inspected directly; it is an earlier mockup, not a screenshot of the running app.

Mobbin: 42 returned screens, **40 distinct screens**, inspected visually across eight searches. References and reusable patterns are below. These are design observations, not usability-test evidence.

Current source inspected: workspace layout/dock/tab selector/action buttons/code header, Git action functions and commit rows, Agent route/activity list, Drafts route, Account settings. This establishes:
- Existing UI structure for file browsing/search/creation, code/save/diagnostics, branch switching, changes/selection/commits, history/diffs, and Account/GitHub connection.
- Microphone, previous/next file, and dock Undo/Redo controls currently lack handlers in the inspected dock components. This does not mean CodeMirror lacks undo internally.
- Agent currently consumes demo activity. Drafts is a placeholder.
- Settings' voice hints/task notification switches currently use local component state; legal and delete-account rows are disabled.
- Commit history now navigates into a commit diff, despite older Notion prose saying rows have no working action. Preserve and complete this existing foundation.
- Push, Pull, stash, merge, revert, discard, publishing, continuous voice, and grouped AI review need UI and behavioral completion; this review is not a comprehensive backend audit.

The simulator connection remained stopped. No application was launched. No runtime behavior or touch-target fit is claimed as verified.

## Why these Mobbin patterns matter

| Observed reference | What is visible | Codaloud application |
| --- | --- | --- |
| [Apple Notes contextual menu](https://mobbin.com/screens/09441835-d6b3-4ad7-9604-b0ee0741eb87) | Related actions separated into groups, with deeper options behind chevrons. | Separate repository, branch, file, and selection menus. |
| [Craft table tools](https://mobbin.com/screens/36232345-aedd-4be0-ad39-b5074491f4ca) | A few prominent tools followed by labeled secondary rows. | Give editor actions or branch operations a small, scoped tool sheet. |
| [Craft format sheet](https://mobbin.com/screens/6906efe5-0ee7-465d-be01-d94e5d92c27d) | Controls appear over the document only when formatting is relevant. | Show selection tools and review controls only when relevant. |
| [Journal formatting panel](https://mobbin.com/screens/0fdaaadd-b9dd-41d3-b942-42ba135be71d) | Compact bottom tools leave the selected content visible. | Keep small edits close to their target; expand long reviews into a dedicated view. |
| [Fabric transcript](https://mobbin.com/screens/325b348f-5710-41f7-a879-dd9e18c494b3) | Transcript sits directly above a compact recording bar. | Expand voice UI only while listening; keep it adjacent to mic/Send. |
| [Otter recording](https://mobbin.com/screens/d944a395-8fb1-4ef3-969b-b5d8fdd62eb8) | Recording controls are visually distinct from transcript content. | Separate capture, sending, and background work states. |
| [Linear navigation](https://mobbin.com/screens/76f79100-ec6d-476b-ad26-b2e038f6a321) | Compact persistent bottom navigation and separate local filters. | Distinguish workspace navigation from Git's Changes/History switch. |
| [Linear workspace switcher](https://mobbin.com/screens/2c26458a-0755-4391-8832-51fc9048762e) | A labeled switcher opens a list with a clear current selection. | A credible compact alternative to four permanently visible tabs. |
| [Dropbox file actions](https://mobbin.com/screens/987ccb68-acdf-4e19-aa13-21526cab712f) | The sheet names its target file above contextual actions. | Repeat the file/branch/commit target in every destructive or delayed operation. |
| [GitHub workflow progress](https://mobbin.com/screens/a3086985-2b47-4048-af7e-81f6941cfab2) | Completed, running, and pending steps appear as rows, with cancellation separate. | Use Agent detail for command steps/results; keep the editor uncluttered. |
| [Manus task progress](https://mobbin.com/screens/349a056c-9781-458c-a31e-22863eb4df7f) | A larger task contains collapsible progress and individual step results. | Expand job details on demand, without turning Agent into a separate chat. |

The design choices below are inferences from these references and Codaloud's requirements. Mobbin screenshots do not establish that a pattern is optimal for Codaloud.

## Shared rules that make all three designs workable

1. **Keep the microphone central.** Mode left, mic in the horizontal center, Send right. These controls never become Git actions. The mode menu chooses Auto-send or Tap to send; changing modes preserves the transcript and does not submit it.
2. **Capture and sending are independent.** First tap requests permission if needed, then shows Connecting → Listening. While active, the center control clearly means Stop listening. Send submits the current instruction and keeps capture active. Stopping capture never cancels accepted jobs. An unsent transcript remains available to edit/send/clear.
3. **Use progressive disclosure.** Short choices use menus; multi-field choices use sheets; long reading/editing uses full-content routes. A child form replaces the parent sheet or uses an internal back button. Never stack several sheets.
4. **One transient status area.** Show the highest-priority event above the voice controls: reconnect/failure needing action, review/conflict, running work, or a brief success. Aggregate the rest into “3 tasks · 1 needs attention,” which opens Agent. When listening, transcript owns that area; reduce other events to a compact badge/row. Do not stack transcript, task cards, toast, review tray, and branch pill.
5. **Keep operations with their target.** Git menu = repository; branch menu = branch; commit menu = commit; file menu = file; selection menu = selected changes. A generic More menu must not become a directory of every feature.
6. **Keep frequently needed actions visible.** Pull and Push are separate controls. Commit appears beside the current selection. Review/Resolve appears when action is needed. Branch is readable on Git. Secondary recovery operations live one layer deeper.
7. **Preserve navigation state.** Switching workspace destinations restores file/cursor/scroll position. Proposed Previous/Next means visited-file history, with unavailable directions disabled in place. This semantics remains a proposal for confirmation during detailed design.
8. **Use state, not extra controls.** Save state progresses through Saving/Saved/Failed; only a successful cloud write means Saved. Tap failure for retry/details. Consolidate diagnostic counts into a Problems entry rather than several permanent icon/count pairs.
9. **Voice is an alternative path to every supported task.** It uses the same selected targets, operations and outcomes as buttons. Quick commands can execute directly; ambiguous requests open a filtered target picker. No routine approval screen for ordinary single-file or multi-file edits.
10. **Respect native constraints.** Aim for 48-point/dp action targets and a 56-point/dp mic, at least 16-point body labels, safe-area clearance, system text scaling, accessible names, and text/icon redundancy for statuses. iOS and Android keep the same information architecture while using platform-appropriate back/menu behavior. These dimensions are design targets pending device validation.

## Design 1 — Contextual Dock

Visual: [Contextual Dock board](contextual-dock.png).

### The idea

Keep the familiarity and thumb reach of the current dock, but separate voice from navigation/tools. The screen's work changes; its voice controls stay stable.

### Placement, top to bottom

- **Header:** Back to Projects, project name, contextual More. On Code, More contains file/editor tools. On Git, More contains repository actions. Keep project settings in a named section or project-title detail view.
- **Context header:** Code shows filename, save state, and one Problems entry. Git shows a tappable branch name, separate Pull/Push buttons with counts and last-fetch status, then Changes/History.
- **Content:** The editor, file rows, changes/history, or activity list. Commit belongs immediately after the selected changes summary. It is not another mic-dock icon.
- **Transient strip:** A compact transcript or event entry appears only as needed.
- **48-point contextual row:** Code = Previous file, Next file, Undo, Redo, labeled Code dropdown. Files = Add, Search, labeled Files dropdown. Git = Search and labeled Git dropdown. Agent = Search/filter and labeled Agent dropdown.
- **72-point voice row:** Mode, centered mic, Send. The workspace dropdown opens Files/Code/Git/Agent with the selected destination indicated and an attention count where appropriate.

Estimated bottom allocation: about 120 points idle, plus safe area; roughly 168–184 with a transcript. Treat these as budgets, not measured results.

### What makes it good

- Closest to the current implementation, with a clear migration from existing dock actions.
- File navigation and Undo/Redo remain near the thumb during voice coding.
- Labeling the workspace selector fixes the ambiguity of an icon-only destination control.
- Moving Commit and sync into Git content creates room for the real voice controls.

### Tradeoffs

- Switching destinations takes two taps.
- The contextual action row changes across destinations, so users must learn each context.
- It still uses two bottom rows. It is a moderate space-saving choice, not the smallest possible dock.

### Critical interactions

- Tap Code dropdown → Git → branch/changes are visible immediately.
- Tap Commit after selecting files → message sheet shows target branch and included tracked/new files → Commit. Push remains separate.
- Tap Git More → Saved stashes → select stash → preview → Apply. Applying retains the stash.
- A completed multi-file edit produces “Review 4 changes.” Tap → a compact review panel; Expand opens full diff. The panel has Previous/Next and per-change Keep/Reject.
- A conflict produces a persistent Resolve entry; full conflict editing replaces the content instead of squeezing into the dock.

### Keyboard behavior

Move the contextual row immediately above the keyboard; reserve the voice row above it when capture is active. Collapse transcript to one expandable line and merge project/file metadata to recover height. Do not create a second Undo/Redo row. When the keyboard obscures too much content on a small device, allow an explicit compact mode; never silently remove Stop/Send while listening.

## Design 2 — Visible Tabs

Visual: [Visible Tabs board](visible-tabs.png).

### The idea

Make all four destinations obvious, and give navigation, voice, and editing tools different places. This is the recommended default for an app with many features and multiple ways to reach them.

### Placement, top to bottom

- **Header:** Back, project name, contextual More.
- **Code context:** Filename/save/problems, followed by a thin 48-point editor toolbar: Previous file, Next file, Undo, Redo, Editor settings.
- **Git context:** Branch selector, independent Pull/Push, last-fetch status, Changes/History. Keep the branch inline with the header if it fits; wrap into its own row when text scaling requires it.
- **Content:** Full workspace destination. Files has Add/Search in its header; Agent has Search/Filter; each keeps its controls close to the relevant list.
- **Transient strip:** Transcript/review/attention summary.
- **Voice row:** Mode, centered mic, Send.
- **Bottom navigation:** Four equal labeled tabs, Files/Code/Git/Agent. Current selection is indicated with more than color.

Estimated persistent bottom allocation: approximately 120–128 points plus safe area. Code has an additional contextual toolbar above its content. Listening adds approximately 48–64 points.

### What makes it good

- One tap between workspaces; no hidden destination to discover.
- A stable Agent badge makes background work and problems visible.
- A clear mental model: bottom tabs choose a place; voice row submits instructions; local tools act on the content.
- It scales well as Git gains functionality because new actions go into the correct content/menu instead of expanding navigation.

### Tradeoffs

- More permanently visible navigation.
- On small devices with the keyboard open, it gives code less space than Focus + Tools.
- Top editor controls are less thumb-friendly than Design 1.

### Critical interactions

- Tap Git → select Changes → choose files → Commit message form → return to Git with “1 commit to push.”
- Tap Agent badge → Needs attention filter → failed push → “Commit saved; push failed” → Retry push.
- Tap review banner → a full-content Code review route, with group title, change counter, path, readable unified diff, Previous/Next, and Keep/Reject. No approval gate before edits.
- Tap branch selector → search Local/Remote branches, choose a branch or Create branch. Branch-row More opens Merge/Compare/Rename/Delete.
- Checks and builds start from Code More → Run a check/build or by voice; results open Agent details, and failures link to code diagnostics where available.

### Keyboard behavior

Move editor actions to a single keyboard accessory row and keep voice controls reachable. Keep the tab destinations available; tapping a tab dismisses the keyboard and restores the destination's state. Merge the top project/file header and collapse transcript to one line. Explicitly test a small phone with all these controls visible before finalizing their exact sizes. Do not shrink labels or targets to preserve the illustrative proportions.

## Design 3 — Focus + Tools

Visual: [Focus + Tools board](focus-tools.png).

### The idea

Treat the editor as the primary surface. Permanent controls are minimal; a clearly labeled Tools sheet provides manual capability when needed.

### Placement, top to bottom

- **Header:** Back, labeled Code dropdown with project subtitle, Tools. The destination dropdown contains Files/Code/Git/Agent and status counts.
- **Context row:** Filename/save/problems in Code; branch/sync in Git.
- **Content:** Maximum available space. Selected code can expose a temporary Explain/Edit menu. No permanent editor shortcut row.
- **Transient strip:** “2 tasks running,” review/attention, or active transcript; expandable and dismissible as appropriate.
- **Only one bottom row:** Mode, centered mic, Send.
- **Tools sheet:** One tap from header. Top identifies its captured target. Code tools start with four large shortcuts: Previous file/Next file/Undo/Redo. Then Find, Editor settings, Run check/build, Review changes. Tools differ by destination and use labeled groups.

Estimated bottom allocation: roughly 72 points plus safe area when idle, and 120–136 while listening. The open tools sheet temporarily uses more content area; closing it returns that space.

### What makes it good

- Best sustained reading and voice-driven editing space.
- All manual capabilities have an obvious named entry rather than an unexplained ellipsis.
- Grouped labeled actions are easier to scan than a wall of toolbar icons.
- Target-aware sheets reduce accidental operations on the wrong file or branch.

### Tradeoffs

- Manual Undo/file navigation costs an extra tap when the sheet is closed.
- Destination switching is also two taps, and the top controls require more reach.
- A bottom sheet can become a dumping ground unless its groups and available actions stay carefully scoped.
- Best for voice-heavy use; less attractive if frequent manual editing dominates.

### Critical interactions

- Tap Tools in Code → captured filename plus editor actions; using Undo leaves the sheet open if continued tool work is useful.
- Select code → Explain/Edit contextual action → shared voice/request surface receives the target. No separate Agent conversation.
- Tap Tools in Git → repository group for Fetch/Stashes/Publishing; branch actions remain on branch picker rows, commit recovery on commit rows.
- Tap review status → full-content review route; large diffs never stay cramped inside Tools.
- Tap running-work row or choose Agent from destination menu → activity list → job detail.

### Keyboard behavior

No permanent editor action row needs accommodation. Tools opens as a keyboard-replacing sheet; dismissing it can return focus to the editor. Stop/Send remain accessible while capture is active. Find-in-file uses a focused input within the sheet; executing Find returns the result to the editor. Avoid two simultaneous inputs competing for focus.

## Complete placement map for all three designs

Read each cell as **entry point → revealed control or view**. Shared behavior below applies regardless of which entry is chosen. “More” means the named screen's contextual menu, not a global dumping ground.

### Workspace, files, code, and voice

| Capability | Contextual Dock | Visible Tabs | Focus + Tools |
| --- | --- | --- | --- |
| Switch Files/Code/Git/Agent | Bottom labeled destination dropdown | Four bottom tabs | Header destination dropdown |
| Back to Projects / project details | Header Back / project title | Header Back / project title | Header Back / project subtitle |
| Browse folders, open file | Files list → folder/file row | Files tab → folder/file row | Destination Files → folder/file row |
| Create file/folder | Files contextual row Add → choose type/name | Files header Add → choose type/name | Files Tools → New file/folder |
| Delete file/folder | Row More → Delete → named-target confirmation | Row More → Delete → confirmation | Row More or selected item Tools → Delete → confirmation |
| File search | Files contextual row Search | Files header Search | Files Tools → Find file |
| File history Previous/Next | Code contextual row | Code editor toolbar | Code Tools shortcut group |
| Manual editing, selection, autocomplete | Tap Code editor / native selection | Same | Same |
| Find in current file | Code More → Find | Code More → Find | Code Tools → Find in file |
| Single-file Undo/Redo | Code contextual row | Editor toolbar | Code Tools shortcut group |
| Editor settings | Code More → Editor settings | Editor toolbar Settings | Code Tools → Editor settings |
| Save status / retry | File header status → failure detail/retry | Same | Same |
| Diagnostics | File header Problems → list → selected location | Same | Same |
| Show current voice target | Selected range + file header; target chip when needed | Same | Same; selection pill offers Explain/Edit |
| Start/stop capture | Center mic in stable voice row | Same | Same |
| Auto-send / Tap to send | Mode control left of mic | Same | Same |
| Immediate Send | Right of mic, enabled for eligible transcript | Same | Same |
| Read/edit long transcript | Tap transcript chevron → expanded transcript sheet | Same | Same |
| Ambiguous spoken target | Filtered target sheet with file/symbol/branch labels | Same | Same |
| Single-file construction/correction | Voice → captured target → live editor changes | Same | Same |
| Multi-file review entry | Review strip → compact panel → Expand | Review strip → full-content review | Review strip or Tools → full-content review |
| Keep/reject changes | Review counter + Previous/Next + Keep/Reject | Same controls on review route | Same controls on review route |
| Explain/review code | Voice or selection menu → result detail | Voice or selection menu → result detail | Voice or selection Explain/Edit → result detail |
| Read results aloud | Result detail speaker action → playback strip | Same | Same |
| Checks/builds/dependency install | Voice or Code More → Run task | Voice or Code More → Run task | Voice or Code Tools → Run task |
| View actual command output | Task strip → Agent job detail → Output | Agent tab / task strip → job detail | Task strip / Agent destination → job detail |

The manual Run task screen offers project-defined check/build choices and a natural-language request for other setup work; no interactive terminal or fifth workspace tab. Clearly distinguish “AI review” from a command that ran. Show missing tooling as a recoverable result instead of pretending every project has the same commands.

Voice details: Auto-send displays a brief countdown and speech can extend/correct it. Tap-to-send allows thinking pauses. Mode changes do not submit. Accepted tasks stay attached to their captured files/branch even if the user navigates. If a delayed edit conflicts with newer edits, expose Needs attention and a comparison instead of overwriting. Permission denial offers typed/manual equivalents and an explicit route to system permission settings.

### Everyday Git, secondary recovery, and publishing

| Capability | Contextual Dock | Visible Tabs | Focus + Tools |
| --- | --- | --- | --- |
| Working status, tracked/new files | Git → Changes | Git tab → Changes | Git destination → Changes |
| Select all tracked/new/both | Changes group headings / checkboxes | Same | Same |
| Per-file selection, readable diff | Changes checkbox / tap filename | Same | Same |
| Commit selected files + message | Inline Commit count → message sheet | Same | Same |
| Search changes/history | Git contextual row Search | Git header Search | Git Tools → Search |
| Current branch/local vs remote | Git branch selector → labeled sections | Same | Same |
| Switch branch | Branch picker → branch row | Same | Same |
| Create branch with starting point | Branch picker → Create branch → name/base | Same | Same |
| Push / publish local branch | Git sync row Push → captured branch/commit operation | Same | Same |
| Pull updates | Git sync row Pull | Same | Same |
| Fetch and divergence freshness | Git More → Fetch; tap sync status to refresh | Git sync status refresh or More → Fetch | Git Tools → Fetch; status refresh |
| Diverged pull | Inline Needs attention → Merge updates / Ask agent | Same | Same |
| Create stash, include new files | Git More → Saved stashes → Save changes | Git More → Saved stashes → Save changes | Git Tools → Saved stashes → Save changes |
| Preview/apply/delete stash | Saved stashes → stash detail → action | Same | Same |
| Discard selected changes | Changes selection More → preview → confirm | Same | Same |
| History/commit details/copy hash | History → commit → detail/hash | Same | Same |
| Undo last eligible unpushed commit | Latest commit More → Undo, keep changes | Same | Same |
| Revert commit | Commit detail More → Revert | Same | Same |
| Merge another branch | Branch picker row More → Merge into current | Same | Same |
| Compare branches | Branch row More → Compare → target/direction | Same | Same |
| Rename local branch | Local branch row More → Rename | Same | Same |
| Delete local branch | Local branch row More → Delete → eligibility/confirmation | Same | Same |
| Initialize Git | Git empty state → Start Git tracking | Same | Same |
| Publish new repository | Local-only Git state / Git More → Publish | Local-only Git state / Git More → Publish | Local-only Git state / Git Tools → Publish |
| Connect GitHub when needed | Import/Publish → connection step → return to saved intent | Same | Same |
| Open on GitHub | Repository/branch/commit More where remote exists | Same | Git Tools or branch/commit More |
| Open/start pull request | Git More or branch More → GitHub handoff | Same | Git Tools or branch More → GitHub |
| Conflict resolution | Resolve strip → dedicated conflict route | Git conflict banner → dedicated route | Resolve status / Git Tools → dedicated route |
| Finish/cancel conflicted operation | Conflict route footer; operation-specific action | Same | Same |
| Partial success / Retry push | Git status or Agent detail → Retry push | Same | Same |

Git behavior:
- Sync counts explicitly reflect the last fetch. No combined “Sync everything” control.
- First push of an untracked local branch says Publish branch. Creating a new repository says Publish repository. They are different operations.
- Commit can run without GitHub. Remote-only controls appear only when applicable. Local-only state explains publishing rather than showing unusable Pull/Push.
- Finish pending saves before a check/build/commit/push depends on them. Show “Finishing saves…” in the initiating control; failure offers recovery.
- Branch switching with dirty work explains blockers and offers safe choices such as staying on the branch or saving a stash. Do not silently discard.
- Stash creation exposes name and include-new-files choice. Preview before Apply/Delete; Apply retains the saved stash. Stash conflicts use the same conflict editor but do not promise merge-style abort semantics.
- Discard preview distinguishes tracked restoration from deleting new files, lists exact targets, and requires explicit confirmation.
- Branch comparison clearly states source, target, and whether it compares tips or changes since their common starting point; choose one explicit default during implementation.
- Rename says local branch; delete rejects active branch deletion and exposes unmerged work. Do not imply remote deletion.
- Undo commit is shown only after confirming it is eligible and unshared. It keeps file changes. Revert creates a new history entry; unsupported merge-parent choices require explicit handling.
- Publish repository form: name, description, visibility, account/owner and commits being published. GitHub connection is optional until import/publish. Do not attach an arbitrary existing remote in this flow.
- Pull divergence offers Merge updates or Ask agent. Do not silently force push.
- Conflict route: operation/source/destination header, conflicted-file counter/list, vertically readable Current/Incoming/Result views, per-block Use current/Use incoming choices, manual resulting-content editor, and voice assistance. Avoid three tiny side-by-side code panes on a phone. “Mark resolved” is per file; “Finish merge/pull/revert” is explicit and enabled only when valid. Cancel/recovery copy depends on the operation.
- Successful commit + failed push says exactly that, with Retry push. Uncertain outcomes are checked before retry. Do not recreate a commit.

### Agent and system states

| Capability | Contextual Dock | Visible Tabs | Focus + Tools |
| --- | --- | --- | --- |
| All request/action history | Destination dropdown → Agent | Agent tab | Header dropdown → Agent |
| Queued/running/complete/failed/attention | Agent rows + aggregated status strip | Agent rows + tab badge + status strip | Agent rows + compact status strip |
| Filter/search activity | Agent contextual row | Agent header | Agent Tools |
| Target, affected files, results/errors | Tap activity → job detail | Same | Same |
| Retry / supported cancellation | Job detail primary action / More | Same | Same |
| Resume result after leaving | Persisted Agent item; tap restored status | Same | Same |
| Setup/restoration progress | Workspace gate with stage/current result | Same | Same |
| Setup/restoration failure | Gate → Retry failed step / Back | Same | Same |
| Lost connectivity | Reconnect content state; editing/capture paused | Same | Same |
| Unavailable permission / credits | Inline reason at initiating action → relevant resolution | Same | Same |

Agent detail has Summary, affected-file links, expandable execution steps and output, and a truthful partial-work explanation. Retry applies to failed work; cancel is offered only where supported. Cancellation means stopping future work where possible, not promising completed edits are erased.

Reconnect copy: “Reconnect to the internet to continue.” Existing unsynchronized work must not be labeled Saved. Accepted background jobs may continue; reconcile results after reconnect. Drafts also do not imply offline support. Restoration says “Restoring your workspace…” and reopens saved file/position after readiness. Long inactivity behavior remains an explicit open product decision.

### Main application and Account — deliberately shared across all three

Using the same shell avoids manufacturing three unrelated onboarding and billing systems just to make the workspace options look different.

| Requirement | Exact placement and trigger in every design | Why |
| --- | --- | --- |
| Apple/GitHub sign-in | Auth screen → provider button | Clear first entry; repository authorization is distinct. |
| Link sign-in methods | Account → Sign-in methods → Link provider | Keeps identity/account concerns out of projects; preserve the same account. |
| Optional practice demo | After auth → Try demo / Skip demo | One optional learning path. |
| Five practice steps | Demo workspace → progress “Step N of 5” + one instruction | Teach Navigate, Select, Describe change, Check, Review/Undo sequentially. |
| Honest practice results | Step 4 says “Practice check, simulated result”; Step 5 shows actual practice diff | Makes simulation explicit. |
| Skip at any point | Demo header Skip demo → optional GitHub step | Avoid trapping experienced users. |
| Optional GitHub onboarding | Connection screen → Connect / Skip for now | Skipping must not block work. |
| Main navigation | Projects / Drafts / Account bottom tabs outside workspace | Stable global destinations without crowding editor. |
| Search/sort projects | Projects top Search and Sort control | Keeps long lists manageable. |
| Start new or import | Main Create button → New project / Import repository | One entry for two different setup paths. |
| New empty project | New project → name only → Create | No forced language/framework step. |
| Import repository | Import → connect if needed → searchable repository sheet → branch picker → Import | Default branch preselected but selection required; no language filtering. |
| Import branch unavailable | Keep form/selection context, show reason and repick | Never silently substitute another branch. |
| Setup/retry | New workspace progress screen → failed-step retry | Preserve source and partial success. |
| Reopen | Project row → restoration gate if needed → prior file/position | Stable workspace identity. |
| Draft list/create | Drafts tab → searchable list + New draft | Makes drafts first-class, not a hidden editor menu. |
| Draft editor | Draft row → name, language/editor content, save state, mic controls | Persistent draft content; no Git/Agent workspace tabs unless a project exists. |
| Copy snippet to project | Draft More → Copy into project → project → file → target location → preview → Copy | Exact destination and insertion point are visible. |
| Copy whole draft file | Draft More → Copy as file → project → folder → filename → Copy | Clear destination hierarchy. |
| Destination collision | Copy flow → Replace / Cancel | No silent overwrite; original draft remains. |
| Account details | Account → profile section | Identity and account management in one place. |
| GitHub management | Account → Connections → GitHub | Connect/reconnect/manage access here and return to interrupted import/publish. |
| Subscription and usage | Account → Plan & credits → usage ledger/action categories | No permanent credits dashboard in editor. |
| Paid-plan credit purchase | Plan & credits → Buy credits when available | Pricing/allowances require product decisions; don't fabricate them. |
| Personal AI instructions | Account → AI preferences → Personal instructions | Shared AI behavior, not per-screen clutter. |
| Voice keywords/mode/read-aloud preferences | Account → Voice & AI → Keywords / Default send mode / Spoken feedback | Quick mode switch stays beside mic; durable preferences stay in Account. |
| Appearance | Account → Appearance | Reuse current theme support. |
| Legal | Account → About & legal → Privacy / Terms | Dedicated readable pages. |
| Sign out / account deletion | Account → Account management; deletion → consequences and explicit confirmation | Away from everyday workspace controls. |

Before implementing drafts, resolve persistence and voice execution limits for standalone drafts. Before implementing paid flows, resolve pricing, renewal, credit rates, transcription billing, insufficient-credit behavior and long-task budgets. The UI destinations are designed; these policies are not invented.

## Deliberately excluded or unresolved

The Notion page explicitly defers: interactive terminal, app preview, Git graph, separate stage/unstage controls, partial-file commit selection, full native pull-request interface, configurable file/folder visibility, and future web/desktop apps. They do not get extra tabs or buttons in this pass. Advanced Git operations are initially agent scope; do not add permanent toolbar actions for rebase/cherry-pick/bisect/reflog/force-push/tags/complex remotes. Supported execution and recovery still need implementation decisions.

Open decisions: draft storage, independent source backup, raw audio retention, subscription prices/renewal/caps/rates/budgets, prolonged inactivity behavior, and final visited-file navigation semantics. Label these honestly during implementation rather than filling them with invented defaults.

## Comparison and recommendation

| Criterion | Contextual Dock | Visible Tabs | Focus + Tools |
| --- | --- | --- | --- |
| Destination switching | 2 taps | 1 tap | 2 taps |
| Undo/file navigation from idle editor | 1 tap | 1 tap | 2 taps |
| Persistent editor space | Middle | Least of the three | Most |
| Thumb reach | Strong for editor controls | Strong navigation; tools higher | Voice strong; header tools higher |
| Discoverability | Moderate | Strongest | Good labeled tools; destinations hidden |
| Closest to current code | Yes | Moderate navigation change | Larger interaction change |
| Best fit | Frequent voice + manual corrections | Balanced everyday use and feature growth | Long voice-first editing sessions |

Recommend **Visible Tabs** unless device testing shows its keyboard layout compromises code readability. It makes the four main jobs obvious, exposes Agent status, and prevents new Git functionality from consuming microphone space. Choose Contextual Dock if minimizing change and thumb-reachable editing matters most. Choose Focus + Tools if maximum code area is more important than immediate manual shortcuts.

## Implementation sequence after choosing a direction

These are UI chunks, each targeting fewer than ten authored files; split further if the actual dependency audit expands scope. Screen-count estimates are not promises about complete backend implementation.

1. Workspace navigation + voice shell + keyboard rules (about 5–8 files). Verify all four destinations, safe areas, keyboard and text scaling.
2. Voice state UI + transcript/mode/target resolution + permission fallback (about 6–9 files). Verify Send versus Stop and mode changes; integration is a separate coherent chunk if needed.
3. Files/editor actions + save/problems + selected-target tools (about 5–8 files). Verify file history and single-file undo behavior.
4. Git sync/local-only/publish forms (about 6–9 files). Verify GitHub optional states and partial commit/push outcomes.
5. Branch creation/merge/compare/rename/delete (about 5–8 files). Verify source/destination and dirty-workspace handling.
6. Stashes/discard/commit recovery (about 6–9 files). Verify exact selection and recovery semantics.
7. Shared conflict resolution (about 6–9 files). Verify each operation's finish/cancel behavior independently.
8. Multi-file review and delayed-edit conflict handling (about 5–8 files). Verify keep/reject preserves unrelated newer edits.
9. Real Agent activity/results/output/retry/cancel (about 5–8 UI files; persistence separately). Verify leaving and returning.
10. Onboarding/demo (about 6–9 files). Verify skips and honest simulated-check labels.
11. Drafts + copy-to-project flow (about 6–9 UI files; persistence separately). Verify destination collision and retained original.
12. Account preferences/legal/identity (about 5–8 files), then Plan/credits UI (about 4–7 files after policy decisions). Verify persistence and entitlement states.

Before code for each new feature: re-read relevant Notion scope, research current official documentation against Expo 57 and installed versions, implement meaningful tests first when tests are warranted, and verify on native iOS/Android. Do not implement placeholder controls as if backend behavior exists.

## Review sequence and verification

Only design documentation and three image artifacts were added. No application code changed, no application launched, no tests run.

Read this document's source/current-state section → shared rules → the three designs and their boards → placement maps → decision boundaries → implementation sequence. Read the prompt archive only to reproduce/refine the images. Check the Mobbin index when evaluating a specific interaction.

Priority design validation after selection:
- Small-phone editor with keyboard + listening, landscape and large text.
- Stop capture versus Send versus cancel accepted job.
- Branch switching during queued work and pending saves.
- Multi-file rejection after later unrelated edits.
- Git without GitHub and correct conditional remote actions.
- Pull/merge/stash/revert conflict recovery and partial push failure.
- Return to project with persisted job result and editing location.

## Full Mobbin reference index

Each linked screen below was visually inspected. Repeated results are listed once. Inclusion is research breadth, not an endorsement of every pattern in each app.

1. [Apple Notes — screen 09441835](https://mobbin.com/screens/09441835-d6b3-4ad7-9604-b0ee0741eb87)
2. [Craft — screen 36232345](https://mobbin.com/screens/36232345-aedd-4be0-ad39-b5074491f4ca)
3. [Freeform — screen 0dc02572](https://mobbin.com/screens/0dc02572-9108-40fd-addc-f3973a4a70a8)
4. [Obsidian — screen 47d88aff](https://mobbin.com/screens/47d88aff-480a-45f0-89e0-2f48e88baf99)
5. [Raycast — screen e31f24d7](https://mobbin.com/screens/e31f24d7-d478-445f-8809-4c3114de19ef)
6. [Journal — screen 0fdaaadd](https://mobbin.com/screens/0fdaaadd-b9dd-41d3-b942-42ba135be71d)
7. [GitHub — screen 3e51df61](https://mobbin.com/screens/3e51df61-84df-40e0-9329-db479541c323)
8. [GitHub — screen ec7e6892](https://mobbin.com/screens/ec7e6892-d03c-47d8-b8ed-a2af58595f8c)
9. [GitHub — screen a5e5e106](https://mobbin.com/screens/a5e5e106-2cbe-410e-a998-86cf6c5fbe2d)
10. [GitHub — screen 4cfaf519](https://mobbin.com/screens/4cfaf519-5975-4193-ab02-034004c53b32)
11. [GitHub — screen 826847f1](https://mobbin.com/screens/826847f1-e95c-4dd6-bf9d-65b9c6470453)
12. [GitHub — screen 2210aab7](https://mobbin.com/screens/2210aab7-8323-40e4-98a6-1739eec50ac3)
13. [Fabric — screen 325b348f](https://mobbin.com/screens/325b348f-5710-41f7-a879-dd9e18c494b3)
14. [ChatGPT — screen 0069ce94](https://mobbin.com/screens/0069ce94-7f48-4420-b6eb-594f6f5bbdbd)
15. [Otter AI — screen d944a395](https://mobbin.com/screens/d944a395-8fb1-4ef3-969b-b5d8fdd62eb8)
16. [Granola — screen e96bd18e](https://mobbin.com/screens/e96bd18e-eec7-49cf-87c3-ff38ab46a47e)
17. [stoic. — screen 25b9ae16](https://mobbin.com/screens/25b9ae16-6b2c-4dd3-9c4b-ae7f7836b029)
18. [Craft — screen 6906efe5](https://mobbin.com/screens/6906efe5-0ee7-465d-be01-d94e5d92c27d)
19. [Play — screen 066fa307](https://mobbin.com/screens/066fa307-5b39-41f9-962b-61bb57dfda2c)
20. [Apple Notes — screen 16521426](https://mobbin.com/screens/16521426-7f01-4d90-9e5b-d8f37754ba32)
21. [Slack — screen e4fa504c](https://mobbin.com/screens/e4fa504c-e639-497e-a270-f34b305dc437)
22. [Superlist — screen 9160a4a2](https://mobbin.com/screens/9160a4a2-e5bf-4282-97d0-76f8a1099f0f)
23. [Notion — screen fd81a99c](https://mobbin.com/screens/fd81a99c-88ed-4274-a3cd-dfb4c04ad275)
24. [Craft — screen a09a1b00](https://mobbin.com/screens/a09a1b00-f7eb-4b89-828a-f53853c2f514)
25. [Linear Mobile — screen 2c26458a](https://mobbin.com/screens/2c26458a-0755-4391-8832-51fc9048762e)
26. [Manus — screen 349a056c](https://mobbin.com/screens/349a056c-9781-458c-a31e-22863eb4df7f)
27. [Vibecode — screen 73cf200c](https://mobbin.com/screens/73cf200c-95e3-49cb-a844-a67f4ea57511)
28. [ChatGPT — screen bc4b3ded](https://mobbin.com/screens/bc4b3ded-6f52-4613-8741-37a65e8887be)
29. [GitHub — screen a3086985](https://mobbin.com/screens/a3086985-2b47-4048-af7e-81f6941cfab2)
30. [Jobber — screen 24494b77](https://mobbin.com/screens/24494b77-07be-45ed-864b-9b8f85a0e915)
31. [Fabric — screen 323f6ed1](https://mobbin.com/screens/323f6ed1-9e2b-4b33-b39d-b95ab098fd48)
32. [Speechify — screen 669226fb](https://mobbin.com/screens/669226fb-c40a-49ef-81c7-c966c7a254f6)
33. [Dropbox — screen 987ccb68](https://mobbin.com/screens/987ccb68-acdf-4e19-aa13-21526cab712f)
34. [GoPro Quik — screen 5d3ac582](https://mobbin.com/screens/5d3ac582-e470-4725-84ff-ae8d07ae0c81)
35. [Asana — screen eff26e28](https://mobbin.com/screens/eff26e28-709f-4640-b391-faa4dbc6f2d3)
36. [Linear Mobile — screen 76f79100](https://mobbin.com/screens/76f79100-ec6d-476b-ad26-b2e038f6a321)
37. [Linear Mobile — screen 4c0b4857](https://mobbin.com/screens/4c0b4857-03d2-4a19-928c-4d854ce91c5d)
38. [Linear Mobile — screen 7c181734](https://mobbin.com/screens/7c181734-96df-46bf-958c-543fd8f3749a)
39. [Linear Mobile — screen 3810be1f](https://mobbin.com/screens/3810be1f-d4fa-4938-ae09-d7a2651c0274)
40. [Linear Mobile — screen 26badb99](https://mobbin.com/screens/26badb99-f19d-4bd2-bd56-a3ce1e28f63b)

