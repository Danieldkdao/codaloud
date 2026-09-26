# Language diagnostics implementation guide

Audience: an implementation agent working in the Codaloud repository. Follow the steps in order. This document is a design and implementation brief, not permission to introduce a cloud code-execution service.

## Goal and product contract

Codaloud is an iOS and Android app. Project files and the Git repository live on the phone. Editing, parsing, and diagnostics should work offline. Do not make diagnostics depend on Daytona, a terminal, remote project synchronization, a user-installed runtime, project scripts, or executing project code.

First-class runnable language families are JavaScript/TypeScript, Python, Java, C, C++, C#, Go, PHP, Rust, and Ruby. JavaScript and TypeScript share tooling but remain distinct language modes. Markdown, JSON, YAML, TOML, XML, INI, `.env`, Dockerfile, and shell are additional editable formats; do not count them as runnable-language families.

“Support” means:

1. The editor selects the correct language behavior from the filename.
2. With no project setup, Codaloud can show syntax/parse findings for as many supported source files as feasible.
3. Single-file checks work for every advertised language, including Java.
4. Multi-file checks use files already in the local project when resolution is deterministic. Missing third-party dependencies must not turn into a wall of bogus errors.
5. Semantic/type diagnostics and style lint are identified separately from parser errors. Do not claim that syntax parsing is full compiler or type-checker support.
6. Findings use the existing squiggles, inline marker, severity counts, and Problems sheet. There must be no language-specific diagnostics UI.

## Important architecture decision

Prefer an **offline, on-device parser and rule engine** over launching language servers. This is a native mobile app, and conventional servers such as `gopls`, `jdtls`, `clangd`, Roslyn, and `rust-analyzer` are long-running host processes with toolchain/project assumptions. They cannot simply be installed as npm packages into the iOS/Android app. Daytona is not part of this proposal.

Use this tiered contract:

- **Tier A — parse diagnostics:** bundle or generate small parser artifacts usable inside the existing CodeMirror Expo DOM/WebView, preferably WebAssembly/JavaScript parsers. These catch malformed syntax without executing user source. This is the baseline promised for all ten families.
- **Tier B — deterministic local rules:** add focused, safe rules on top of parsed syntax trees (for example duplicate declarations, unreachable branches only if reliably known, suspicious constructs, and configured format/schema validation). Rules must be documented and produce stable codes. Never invent compiler semantics from text matching.
- **Tier C — semantic project analysis:** only add a tool when it can run on-device, offline, within explicit memory/time budgets, and without executing project configuration. Reuse the existing TypeScript compiler analyzer. For other languages, do not promise full type checking until an implementation satisfying those constraints is proven. Keep the analyzer interface ready for future engines.

If an implementation concludes a language needs a remote service for full diagnostics, stop before building that dependency and document a product/architecture decision request. The remote service would send private source off-device, require connectivity, need untrusted-input isolation and retention controls, and contradict the current offline contract. Do not silently use a cloud API or a hidden sandbox.

Tree-sitter is a strong parser candidate because its parser runtime supports WebAssembly and language grammars can be generated as WASM artifacts. Confirm grammar license, artifact size, runtime compatibility inside the actual embedded WebView, startup cost, and diagnostics quality before adopting it. A parser’s `ERROR`/missing nodes mean malformed syntax only; they do not establish type correctness. CodeMirror’s Lezer grammars already used for highlighting are not automatically complete validators.

## Existing code to preserve and extend

Read these files before changing anything:

- `src/services/typescript/analysis.ts` — existing in-process TypeScript Language Service host, dependency graph loading, editor-buffer precedence, compiler diagnostics, and completion behavior. It bounds the graph and does not execute project scripts. Extend it for `.js`, `.jsx`, `.mjs`, and `.cjs` through TypeScript JS mode; do not create a duplicate JavaScript analyzer.
- `src/features/projects/actions/code-intelligence-actions.ts` — project-scoped action that supplies local project file reads to the TypeScript analyzer. The current module-global session is one-project-at-a-time; preserve project isolation and lifecycle if adding engines.
- `src/features/projects/actions/code-intelligence-schemas.ts` — Zod contract for file path/content, diagnostic severities (`error`, `warning`, `info`), offsets, and results. Improve this shared contract rather than inventing language-specific payloads.
- `src/components/code-editor-intelligence.ts` — per-editor CodeMirror linter extension, debounce, request serialization, stale document checks, and analysis status callback. Reuse it; make analyzer selection an injected dependency/registry rather than adding branches in the React component.
- `src/components/code-editor.tsx` — loads CodeMirror syntax support from filename, installs intelligence, and owns editor buffers. Keep this component free of parser and linter implementation details.
- `src/features/editor/diagnostics.ts`, `src/features/editor/lib/formatters.ts`, and `src/features/editor/components/editor-problems-sheet.tsx` — existing diagnostic decorations and Problems UI. Extend only if needed to display source/code safely.
- `src/features/editor/formatting.ts` — current extension switch for Prettier parsers; it is formatting, not diagnostic validation. Reuse its extension normalization idea, not the formatter as a lint engine.
- `src/features/agent/lib/file-diagnostics.ts` and workspace tools — agent-facing diagnostics currently explicitly TypeScript-only. Update the contract/description when broader file diagnostics actually exist; never tell the agent every language has TypeScript checks.
- `src/features/projects/constants.ts` — inspect file-size and code-intelligence path bounds before adding parsers.
- `src/services/local-workspace/execute.ts` — local project file access. Do not bring Daytona into this path.

The CodeMirror editor already receives standard diagnostics with zero-based UTF-16 offsets and renders error/warning/info states. The existing analyzer action takes `path` and current buffer `content`, and the TypeScript language service can read other project files through local workspace actions. Preserve unsaved-buffer precedence.

## Module layout

Use focused, lower-kebab-case files. Adjust names only if the existing module shape clearly calls for it.

```text
src/features/code-intelligence/
  types.ts                    # shared internal analyzer contracts
  file-type.ts                # extension and basename routing, pure function
  analyzer-registry.ts        # maps file type to analyzer; no UI imports
  diagnostics.ts              # normalization, offset conversion, dedupe, limits
  parsers/
    tree-sitter-runtime.ts    # lazy parser/WASM loading and lifecycle
    tree-sitter-analyzer.ts   # parse result -> common findings
    grammars.ts               # explicit supported grammar metadata/licenses
  rules/
    ...                       # small language-specific rule modules
  tests/                      # unit tests for routing/normalization/rules
src/services/typescript/       # existing compiler/LSP-like implementation stays here
src/features/projects/actions/code-intelligence-actions.ts # dispatch + local files
src/features/projects/actions/code-intelligence-schemas.ts # wire validation
```

Do not create a catch-all `utils.ts`, a folder per language containing one-line wrappers, or ten copies of the same debounce/offset logic. Put a language-specific file under `parsers/` or `rules/` only when it has real unique behavior. Static grammar WASM assets should be grouped and loaded lazily; do not eagerly import every grammar into the initial app/editor bundle.

Keep `features/code-intelligence` independent of React and CodeMirror. It should accept a file path/content plus an abstract project reader and return plain diagnostic data. The editor component converts that data to CodeMirror’s diagnostic type at the boundary.

## Diagnostic and runtime rules

1. Extend the wire/internal diagnostic contract to carry `source` and a stable string `code` (not only a number), optional `relatedInformation`, and optional `tags` only if the UI can present them. Keep `from`/`to` as half-open UTF-16 offsets into the exact submitted document. Preserve existing consumers by supplying defaults during migration.
2. Normalize severities: parser fatal/syntax errors -> `error`; rule violations -> `warning`; optional advice -> `info`. Reserve CodeMirror `hint` for a future quick-fix action; do not silently map every informational item to warning.
3. Validate every range against the submitted content. Clamp only when a source protocol is known to be one-based or out-of-range in a documented way; otherwise drop invalid findings and log a bounded internal error. Zero-width positions are permitted.
4. Include diagnostic `source` in UI/agent output (examples: `TypeScript`, `Tree-sitter: Python`, `Ruff`, `JSON parser`). Deduplicate only exact `(source, code, range, message)` duplicates; do not merge distinct tools’ findings just because the text matches.
5. Every request is tagged with document key and monotonically increasing revision. Apply a result only when project, path, and revision still match. Keep the existing stale-result guard. A filename switch or project switch must invalidate the prior result.
6. Debounce interactive diagnostics (target 200–350 ms for local parsers); parse only the active file while typing. Recheck the full project graph only when the user asks, saves, or a relevant sibling file changes. Keep one request in flight per editor where that matches current behavior.
7. Do not parse generated/binary/oversized content. Reuse the repository size bound; add per-parser time/memory/output caps. Parser failure is `unavailable` with a concise status, never an empty `ready` result.
8. Never invoke shell commands, package-manager scripts, build hooks, analyzers loaded from the project, compiler plugins, or project-provided config code. Read passive config files only when their format is explicitly supported and parsing them does not execute code.
9. Do not change the editor’s native/local save path. The analyzer’s current open-file text always overrides the saved file; related project files come from the local workspace API.

## File routing policy

Implement one pure `getCodeFileType(path)` (or equivalent) registry. Normalize `/`, lowercase extensions, and check special basenames before extensions. Use the whole filename where language selection depends on it. Unknown extensions return `unsupported`; never guess based on source text.

| File pattern | Mode and analysis |
|---|---|
| `.ts`, `.tsx`, `.mts`, `.cts` | Existing TypeScript analyzer; TypeScript mode. |
| `.js`, `.jsx`, `.mjs`, `.cjs` | Same TypeScript analyzer in JavaScript mode. Honor safe `jsconfig.json`/`tsconfig.json` options only if already passively parsed; default `allowJs: true`, `checkJs: false` unless `// @ts-check` is present or the project opts in. |
| `.py` | Python parser plus only deterministic built-in rules initially. |
| `.java` | Java parser; single-file and project-local multi-file declarations as specified below. |
| `.c`, `.h` | C parser. `.h` is ambiguous; use C-compatible default, do not infer C++ unless neighboring/context metadata says so. |
| `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh`, `.hxx` | C++ parser. |
| `.cs` | C# parser. |
| `.go` | Go parser. |
| `.php` | PHP parser; support mixed PHP/template text when grammar allows. |
| `.rs` | Rust parser. |
| `.rb` | Ruby parser. |
| `.md`, `.mdx` | Existing Markdown editor/preview; Markdown structural checks are a separate format analyzer. |
| `.json`, `.jsonc`, `.json5` | Use their respective syntax rules; do not validate JSONC/JSON5 as strict JSON. Add schema validation only when a safe schema is available by convention or user selection. |
| `.yaml`, `.yml`, `.toml`, `.xml`, `.ini`, `.env`, `Dockerfile`, shell names/extensions | Format parser/validator where a bundled parser exists. Start with syntax only and avoid value/secret warnings that imply uploaded content. |

Check collisions and mode behavior in CodeMirror’s current `languages` list. Highlighting selection and diagnostics routing may share the registry but should not be forced into one heavyweight import.

## Language-specific implementation

The server/tool names below are **not** an instruction to install them in the mobile app. They are known reference tools for their diagnostics behavior. The first implementation should use an embeddable parser if available and must meet the local/offline contract. Native language servers may be evaluated separately only if they compile to a supported in-app runtime and pass size/performance checks.

### JavaScript and TypeScript

- Keep the existing TypeScript compiler Language Service analyzer as the authoritative parser/type engine for JS/TS.
- Add JS-family extension routing to the same analyzer. In JavaScript mode, do syntax diagnostics by default. Enable checkJs from an explicit safe project setting or `// @ts-check`; do not enable project-wide strict JS checks unconditionally because this creates noisy implicit-any errors in ordinary JS projects.
- Retain TypeScript project type checking and existing `tsconfig` support. Continue treating config as data; no plugins or scripts.
- Do not add ESLint as a required analyzer in this pass. ESLint config is executable/plugin-loaded project code and can vary by package; it violates the no-user-setup/offline-safe baseline unless an isolated, explicitly designed configuration-free preset is selected later. If lint rules are added, make them Codaloud-owned and label their source separately.

### Python

- Route `.py` to an embeddable Python grammar for syntax errors.
- Do not market Python type checking without a real checker. Pyright is the conventional reference for project-aware Python types, but its Node-based language server and Python environment assumptions need proving in an on-device build before adoption. A `ruff`/Ruff LSP reference is useful for lint semantics, but do not execute a project-specific Ruff config or claim Ruff support until runtime packaging is verified.
- Baseline rules must be narrow, deterministic, and not produce type claims.

### Java (including standalone and multi-file)

- `.java` always gets syntax diagnostics even if there is no `pom.xml` or Gradle project.
- Single file: parse the active Java file without requiring a JDK/project manifest. Report grammar errors, not unresolved JDK symbols as syntax errors.
- Multi-file: construct a virtual read-only source set from local `.java` files, keyed by normalized workspace-relative path. Resolve package declarations and project-local type declarations. Do not download Maven/Gradle dependencies or run a wrapper/build file.
- If a complete Java parser/compiler frontend is not practical in-app, keep parser findings as the baseline and show project symbol checks only when the selected grammar reliably supports them. Report “external classpath not checked” as status/help text, not hundreds of errors.
- Eclipse JDT LS (`jdtls`) is the conventional IDE reference but assumes a JVM and classpath/workspace setup; it is not an automatic fit for native mobile. Only use it if a supported embedded runtime is demonstrated.

### C and C++

- Route C and C++ separately; distinguish their extensions and grammar modes.
- Parse the active file without compile flags. For multi-file, optionally index declarations from other local files, but do not claim include resolution or build correctness without actual include paths/defines.
- Do not surface every standard header include as an error when no toolchain/sysroot is available. Use parser-error findings only and explain that compiler diagnostics require build context.
- clangd is the conventional reference. Its own documentation explains that compile commands, include paths, target, macros, and standard library context materially affect diagnostics; without them, false positives are expected. Do not install or call clangd from the phone in this task.

### C#

- `.cs` gets parser-based syntax diagnostics by default and local declaration checks only if proven reliable.
- Full Roslyn compiler/analyzer diagnostics need the .NET SDK, references, and project context; do not report unresolved framework symbols as syntax errors.
- Do not load MSBuild targets, analyzers, source generators, or project code. Treat `.csproj` as passive metadata only if a safe subset is explicitly parsed.

### Go

- `.go` gets parser-based syntax diagnostics independent of `go.mod`.
- For multi-file local checks, include sibling `.go` files in the same directory only when package names match; do not assume external module availability. Avoid full `go list`, build, or module download.
- `gopls` is the conventional semantic-server reference. `go vet` and staticcheck are deeper project checks, not a bundled mobile baseline.

### PHP

- `.php` gets parser syntax findings, including PHP open/close-tag behavior if the grammar supports it.
- Do not require Composer or autoload configuration for syntax support. Multi-file symbol checks may use local PHP declarations, but unresolved Composer dependencies are out of scope unless locally present and safely indexed.
- PHPStan/Psalm and PHP_CodeSniffer are reference tools for static analysis/style, not built-in support until their runtime/config behavior is verified.

### Rust

- `.rs` gets parser syntax diagnostics by default.
- Multi-file module resolution may follow only local `mod` paths deterministically; do not fetch crates or run build scripts/procedural macros. Report unavailable crate/type context as unchecked rather than as errors.
- `rust-analyzer` and `cargo check` depend on Cargo workspace/dependency context. Clippy is an optional deeper lint engine; none should be invoked by the initial on-device parser implementation.

### Ruby

- `.rb` gets parser syntax diagnostics without requiring Ruby to be installed.
- Do not execute gemfiles, Bundler, or project code. Index local declarations only if the parser supports reliable boundaries.
- Ruby LSP is a conventional editor-server reference; RuboCop is a separate lint engine. Sorbet/Steep are opt-in type systems and cannot be promised without project setup.

### Non-runnable formats

- Keep Markdown preview independent of linting. Add only stable structural findings (for example malformed frontmatter if parser support is present).
- JSON-family parsing should identify exact grammar mode. Never execute schema references fetched over the network. A schema can be supplied from a local recognized file only after a safe resolution rule is specified.
- YAML/TOML/XML/INI/env/Dockerfile/shell checks are syntax/format checks, not language compiler diagnostics. Start with malformed syntax only and label source accurately.

## Phased implementation plan

Keep each code chunk reviewable and normally under ten changed files. Reassess before expanding a chunk. Each phase ends with verification before starting the next. The implementation agent should write tests first when adding feature behavior, following `AGENTS.md`.

### Phase 0 — baseline and dependency feasibility

1. Trace how CodeMirror calls `readProjectCodeIntelligence`, how editor callbacks cross the DOM/native boundary, and where source files are read.
2. Verify current TypeScript behavior for `.ts` and `.js` before changing it; record offsets, severities, project reader behavior, and size limits.
3. Prototype one non-TypeScript parser inside the actual Expo DOM/WebView on both iOS and Android. Measure cold startup, WASM asset size, parse latency, memory, and Unicode/newline offsets.
4. Pick parser(s) only after checking licenses, maintenance, WebAssembly support, platform behavior, and bundle impact. Do not add every grammar before a prototype succeeds.

### Phase 1 — common contract and filename routing

1. Add a pure supported-file registry and unit coverage for every extension, basename, case, and ambiguous extension.
2. Extend diagnostics with `source` and stable string `code`, migrating existing numeric TS codes without breaking UI/agent consumers.
3. Extract pure range validation, severity/source normalization, exact deduplication, diagnostic caps, and revision-aware result filtering.
4. Refactor editor intelligence to receive the selected analyzer from a registry. Keep debounce/stale checks in one shared place and preserve the existing Problems UI.

### Phase 2 — JS/TS parity and parser runtime

1. Extend the TypeScript analyzer to JavaScript extension aliases, preserving `.ts` behavior.
2. Define JS checkJs selection rules; cover `// @ts-check`, safe config options, and ordinary unconfigured JS without noisy type errors.
3. Introduce lazy parser runtime behind a single interface: `analyzeFile({path, content, projectReader?, revision}) -> {status, diagnostics}`.
4. Keep the parser runtime free of UI, project DB, and provider dependencies. Dispose worker/parser resources on document or project teardown.

### Phase 3 — five language families

Implement Python, Java, C, C++, and Go baseline syntax diagnostics using the chosen parser artifacts. Put unique conversion logic in small modules, share parser execution and output normalization. For Java/Go, add only reliable local project-file context; never require a manifest for active-file syntax checks.

### Phase 4 — remaining four families

Implement C#, PHP, Rust, and Ruby baseline syntax diagnostics. Add Rust local module-file context only if deterministic. Do not add heavyweight language servers, compilers, package managers, or dependency downloads.

### Phase 5 — config/document formats and polish

Implement syntax validation for supported non-runnable formats that do not already have a reliable editor parser. Separate these results from runnable-language diagnostics by source. Make unsupported formats explicitly `unsupported` instead of `ready` with no diagnostics.

### Phase 6 — curated optional rules

Only after parser coverage is stable, propose Codaloud-owned safe rules. Add one small rule group at a time with rationale, examples, and false-positive review. Never load arbitrary project lint config or plugin code. Add a “diagnostics level” only if product/UI design defines what it means.

## Test and verification checklist for implementation

- Route every extension to the intended grammar and analyzer; unknown files stay unsupported.
- Valid and invalid syntax fixtures for every family. Include nested braces, strings/comments containing fake syntax, Unicode before a finding, CRLF, empty files, EOF findings, and multiple findings.
- Active unsaved buffer overrides saved disk contents; sibling project files come from the local reader.
- Java single-file diagnostics work without project metadata; Java multi-file project declarations resolve by package/path rules without network access.
- C/C++ without compile metadata do not emit invented missing-header/type errors.
- JS defaults do not produce `checkJs` type noise unless opted in.
- Stale results after edit, tab switch, project switch, close/reopen, or reordered request completion never replace current diagnostics.
- Oversized/malformed parser output fails closed as unavailable; a parser crash does not crash the editor.
- Problems panel and inline markers show severity, source, and code correctly; source is included in agent diagnostics and claims match actual engine capability.
- Run TypeScript typechecking and the narrow affected test suites after each phase. Do not bundle all parser grammars into the initial app chunk; inspect native build size.
- Verify on both iOS and Android devices/simulators because CodeMirror runs inside an embedded DOM/WebView, while surrounding file reads are native.

## Completion criteria

The initial deliverable is complete when all ten language families and the selected config formats route by filename, at least parser-level syntax findings work offline for every first-class family (including Java without project files), the existing TS behavior remains intact, all findings appear through the shared Problems UI with honest source/severity/status, stale responses are rejected, and no project code/config executes. Document the exact coverage boundary for each language. Do not claim full compiler/type/lint parity with desktop IDEs unless those engines are actually present and verified.

## References

- Codaloud requirements page: [Codaloud in Notion](https://app.notion.com/p/3d2b3d6d3d6f809b9c82e98a68e01be1)
- CodeMirror lint API: [CodeMirror reference](https://codemirror.net/docs/ref/#lint)
- TypeScript Language Service: [Using the Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
- TypeScript Compiler API: [Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- clangd project context and compile commands: [clangd installation and project setup](https://clangd.llvm.org/installation), [compile commands](https://clangd.llvm.org/design/compile-commands)
- Tree-sitter’s [official web binding guide](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md) documents the WebAssembly binding and parser ABI compatibility; its [CLI build guide](https://tree-sitter.github.io/tree-sitter/cli/build.html) documents WASM grammar builds. Verify the license and maintenance of every individual grammar; the parser runtime’s license does not automatically cover its grammars.
