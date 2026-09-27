# Language diagnostics architectures: in-app LSP vs. server-side analyzers

**Date:** 2026-09-26
**Scope:** Getting real language-server-grade errors (undefined names, type errors, unused imports) for Python, C++, Java, Go, Rust, Ruby, PHP, and shell into a React Native / Expo app that today ships tree-sitter syntax-only findings.
**Method:** Primary sources — npm/PyPI/RubyGems registry metadata, GitHub REST API and raw license files, container registry manifests, official vendor docs. Latency and memory figures were **measured locally** on macOS arm64 with small single-file fixtures. No application code was changed. Claims I could not verify are marked **unverified**.

This document complements [`in-app-language-runtimes.md`](in-app-language-runtimes.md), which surveys in-app *interpreters and compilers* (Pyodide, Prism, clang-wasm). This document covers the two questions that document does not: running an actual **language server** in-app, and running **server-side analyzers** in a sandbox.

---

## 0. Two premises in the request that do not survive checking

These change the shape of the answer, so they come first.

### 0.1 There is no server-side sandbox to extend

The request states the app "ALREADY has a server-side sandbox (Daytona workspace) that clones the user's git repository and runs shell commands for an AI agent." **It does not.** The app migrated off that architecture.

What the code actually shows:

- [`docs/research/local-workspace-migration.md`](local-workspace-migration.md) records that the "persistent Daytona workspace adapters" and Trigger jobs were **removed**. The workspace is now on-device: device SQLite, local files, and a native libgit2 1.9.7 module ([`modules/local-workspace`](../modules/local-workspace)).
- The agent's entire tool set ([`src/features/agent/tools/workspace-tools.ts`](../src/features/agent/tools/workspace-tools.ts)) is `readFile`, `listFiles`, `searchFiles`, `saveFile`, `editFile`, `createFile`, `renameFile`, `deleteFile`, and 15 `git*` tools. **There is no shell-execution tool.** Every one of these runs locally via `src/services/local-workspace/`.
- [`src/trigger/workspace-task.ts`](../src/trigger/workspace-task.ts) is a pure orchestrator. It emits a waitpoint and blocks on `wait.forToken()` until the **device** returns a result. It never touches the user's files itself.
- The only surviving Daytona code is [`src/services/daytona/temporary-execution.ts`](../src/services/daytona/temporary-execution.ts): an **optional, opt-in** helper that requires a **caller-supplied Daytona API key**, creates an **ephemeral TypeScript-image** sandbox, uploads a bounded snapshot, runs one command, and deletes the sandbox in a `finally`. It is not wired into the agent flow, it is not a persistent workspace, and it is not a repo clone.

**Consequence:** Scope B is not "extend the existing sandbox." It is greenfield infrastructure — new credentials, a new trust boundary, a new data-egress path, and a new cost line — that must be built from zero.

There is a second-order problem. The project's own design brief already **ruled this out**: [`language-diagnostics-implementation-guide.md`](language-diagnostics-implementation-guide.md) states "Do not make diagnostics depend on Daytona, a terminal, remote project synchronization, a user-installed runtime, project scripts, or executing project code," and explicitly says that if a language needs a remote service for full diagnostics, the implementer must "stop before building that dependency and document a product/architecture decision request." Scope B is a reversal of a documented product decision, not an incremental improvement. That decision should be re-litigated explicitly before any code is written.

### 0.2 LSP4Web does not exist

GitHub's search API returns **0 repositories** matching `lsp4web` in name. A web search for "lsp4web" returns only [eclipse-lsp4e/lsp4e](https://github.com/eclipse-lsp4e/lsp4e) (Eclipse LSP4E, a Java/Eclipse LSP framework — a different project) and unrelated Louisiana State Police pages. There is no npm package, no Open VSX extension, and no project site.

The underlying *idea* is real and is spelled **`monaco-languageclient`**, which is the maintained library for connecting a browser Monaco editor to a remote LSP over WebSocket. It is assessed below.

---

## 1. Summary comparison table

Verdict key: **Recommend** · **Viable, conditional** · **Not viable** · **Rejected**

| Option | Languages | Real error quality | JSON output | Install cost | Verdict |
| --- | --- | --- | --- | --- | --- |
| **pyright** | Python | True static type checking, best-in-class messages | Yes — `--outputjson` | pip/npm, bundles Node | **Recommend** (server-side) |
| **ruff** | Python | Lint + pyflakes, **not** a type checker | Yes — `--output-format=json` | Single 12 MB binary | **Recommend** (server-side) |
| **mypy** | Python | True static type checking | Yes — `--output=json` (JSONL) | pip, pulls `mypy_extensions` | **Viable, conditional** — slower, weaker config story |
| **basedpyright** | Python | pyright fork, more rules by default | Yes (inherits pyright) | pip, ~25 MB | **Viable, conditional** |
| **clangd** | C, C++ | True compiler-grade semantic analysis | **No** in current CLI — see §3.1 | ~1–2 GB toolchain (libs) | **Recommend via LSP**, not via CLI |
| **gopls** | Go | True type checking, full module graph | Yes — `gopls check` (JSON) | Go toolchain + module download | **Recommend** (expensive) |
| **eclipse.jdt.ls** | Java | True type checking, full classpath resolution | Yes — LSP only | JRE + Gradle/Maven project model | **Viable, conditional** — heaviest |
| **rust-analyzer** | Rust | True type checking, cargo metadata | Yes — LSP only | rustc/cargo toolchain | **Viable, conditional** |
| **phpstan** | PHP | True static analysis, level-based | Yes — `--error-format=json` | Composer/PHAR, needs PHP | **Recommend** (server-side) |
| **intelephense** | PHP | Good type inference, no real static types | LSP only | 25.9 MB npm bundle | **Viable, conditional** — MIT |
| **solargraph** | Ruby | True type checking via yard/RBS | Yes — `--socket`/LSP | Ruby gem tree, heavy | **Not viable** for latency budget |
| **python-lsp-server (pylsp)** | Python | Pyflakes-level only, no type checking | LSP only | pip, light | **Not viable** on quality |
| **shellcheck** | shell | Real POSIX/bash analysis, not a type checker | Yes — `--format=json` | 72 MB installed | **Recommend**, with GPL flag |
| **typos** | all (text) | Spell/typo only, not a type checker | Yes — `--format=json` (JSONL) | 11.5 MB single binary | **Recommend** as a cross-language layer |
| **monaco-languageclient** | any remote LSP | Whatever the server provides | LSP over WebSocket | npm, 0.33 MB | **Viable, conditional** — needs a server |
| **vscode-languageclient/browser** | any remote LSP | Whatever the server provides | LSP over WebSocket | npm, 0.77 MB | **Viable, conditional** — needs a server |
| **Pyright in a WebView/Hermes** | Python | True type checking | n/a | — | **Not viable** — Node-only |
| **Solargraph in-app** | Ruby | True type checking | n/a | — | **Not viable** — Ruby runtime absent |
| **gopls / clangd / rust-analyzer / jdtls as WASM** | — | — | — | — | **Rejected** — do not exist |
| **devcontainer "language server pack" image** | all | — | — | — | **Rejected** — does not exist |
| **golangci-lint** | Go | Aggregated linters | Yes | Go toolchain | **Rejected** — GPL-3.0, redundant with gopls |

---

## 2. Scope A: running a language server in-app

### 2.1 There are no WASM builds of the real language servers

I searched for WASM builds of every server named in the request. Findings:

- **gopls, clangd, rust-analyzer, eclipse.jdt.ls** are native binaries produced by large toolchains (Go, LLVM/Clang, Rust, Java). None ships a WebAssembly build, and none has an official one planned. Rust-analyzer's architecture (proc macros, `cargo metadata`, incremental `rustc` queries) has no meaningful WASM translation.
- **GitHub search for `pyright wasm` and `language server wasm`** surfaces no official or credible maintained project. There is no `pyright-wasm`.
- The only genuinely maintained in-browser LSP *client* is `monaco-languageclient` (v11.0.2, MIT, 0.33 MB, 34 deps, modified 2026-09-24). It speaks LSP to a **remote server**; it does not embed one.

**Conclusion: there is no WASM language-server story.** In-app language intelligence must come from either (a) a bundled compiler/interpreter, covered in [`in-app-language-runtimes.md`](in-app-language-runtimes.md), or (b) a remote server, covered in §3.

### 2.2 Can a Node LSP client run in the WebView?

Yes, for a **client**, and this is a real option — but it only makes sense paired with a server.

| Package | Latest | License | Unpacked | Notes |
| --- | --- | --- | --- | --- |
| [`monaco-languageclient`](https://www.npmjs.com/package/monaco-languageclient) | 11.0.2 | MIT | 0.33 MB | 34 deps; actively maintained; built for exactly this |
| [`vscode-languageclient`](https://www.npmjs.com/package/vscode-languageclient) | 10.1.2 | MIT | 0.77 MB | 121 files; the canonical client, but Node-flavored |

`vscode-languageclient/browser` is the browser entry point of the same package. Both are viable inside a WebView, which has `WebSocket` and `WebAssembly`. Neither is useful in **Hermes**, which the project's own rules already flag as missing several Web APIs the client's transitive dependencies touch.

**Verdict: Viable, conditional** — adopt only together with a server to connect to. It converts the problem from "ship a compiler in the app binary" into "ship a client in the app binary," which is a far smaller ask (0.33 MB vs. tens to hundreds of MB).

### 2.3 Why the Python servers cannot run in-app

This is worth stating precisely because Pyright is the single most valuable tool in the whole survey.

The npm `pyright@1.1.414` package is 19.5 MB unpacked across 5,423 files. I read its manifest: it declares `engines.node >= 14`, a `bin` entry of `index.js`, **no `browser` field**, and a dependency on `fsevents`. It is a Node CLI plus a Node language server. It is not a browser library and cannot be bundled into a WebView or Hermes without a Node runtime, a filesystem, and `child_process`.

The Python wheel is the same story: `pyright` on PyPI is a 6.2 MB wrapper that pulls `nodejs-wheel-binaries` and shells out to that Node binary. **Verdict: Not viable in-app.**

### 2.4 Solargraph and pylsp in a constrained environment

- **Solargraph** (RubyGems `solargraph` 0.60.4, MIT, 39.6M downloads, released 2026-08-30) is genuinely maintained — the GitHub repo shows commits on 2026-09-26. It is a real type checker that reads yard and RBS. But it is a Ruby application with a large gem tree (`parser`, yard, rbs, backport, jaro_winkler, and more), boots a full Ruby VM, and builds a workspace-wide index. In a mobile process this is minutes of boot, not milliseconds, and the app has no Ruby runtime. **Verdict: Not viable in-app; also not viable for per-keystroke latency even server-side** (see §3.3).
- **python-lsp-server** (1.15.0, MIT, repo pushed 2026-07-27) is light and pip-installable, but its diagnostics come from **pyflakes**, which finds undefined names and unused imports but performs **no type inference**. Note an oddity: PyPI shows 1.15.0 while the latest GitHub release is v1.14.0 (2025-12-06). **Verdict: Not viable as a quality upgrade** — pyright/ruff strictly dominate it at similar cost.

### 2.5 The memory and heap reality

The app already loads 16.2 MB of tree-sitter grammar WASM and works around a missing `FinalizationRegistry`. The binding constraint is not disk but **available heap on a ~2–4 GB phone**, shared with the OS, the WebView, and the editor. Measured peaks for the tools that would be the candidates (single small file, §4):

| Tool | Peak RSS | Notes |
| --- | --- | --- |
| pyright | **154 MB** | Node runtime dominates; scales with project size |
| clangd | **49 MB** | bare file, no project model |
| mypy | **41 MB** | |
| typos | 33 MB | |
| shellcheck | 27 MB | |
| ruff | **16 MB** | cheapest by a wide margin |

A phone will not run a 154 MB Node process per keystroke alongside everything else, and WASM's 32-bit address space caps a single memory at 4 GB with practical limits well below that. **Verdict for Scope A: reject in-app language servers; keep tree-sitter for syntax and consider a lightweight in-app lint layer (see §5).**

---

## 3. Scope B: server-side diagnostics

### 3.1 What the measured output formats actually are

I installed and ran each tool against a small fixture containing deliberate undefined-name and type errors. Results are in §4. One finding contradicts the widely repeated claim that `clangd --check-locations` is a JSON emitter:

**`clangd` CLI does not reliably emit JSON.** The Homebrew LLVM 22.1.8 build:
- rejects `--check-locations=<file>` ("invalid value for boolean argument"),
- rejects a bare `--check-locations <file>` ("Unknown command line argument"),
- documents `--check[=<string>]` instead ("Parse one file in isolation instead of acting as a language server"),
- and requires `--check-lines` in `Begin-End` form (`--check-lines=9-11`), not `0`.

With `--check=bare.c` it **found the error** ("All checks completed, 1 errors", `[undeclared_var_use] Line 8: use of undeclared identifier 'undefined_symbol'`) but wrote it as a **human-readable log line to stderr**, not JSONL. Older clangd releases did emit JSONL diagnostics; this version does not.

**Implication: for C/C++/Rust/Java, drive clangd, rust-analyzer, and jdtls as LSP servers over stdio, not via CLI check modes.** The LSP route is the only stable, structured one. This is a meaningful architectural constraint and it is invisible unless you actually run the binary.

### 3.2 What cloud IDEs actually do

This was the most useful part of the research, because it settles the architecture question.

- **VS Code's own docs** draw the line explicitly. Under Remote Development, extensions are split into UI Extensions (run in the browser) and **Workspace Extensions**: *"When in a remote workspace or when using Codespaces, Workspace Extensions run on the remote machine / environment. Workspace Extensions can access files in the workspace to provide rich, multi-file language services, debugger support, or perform complex operations on multiple files in the workspace (either directly or by invoking scripts/tools)."* ([Remote Development and Codespaces](https://code.visualstudio.com/api/advanced-topics/remote-extensions))
- **Gitpod, now rebranded Ona**, runs the same model. Their container-configuration docs specify a devcontainer base image plus `customizations.vscode.extensions`, and recommend Microsoft's `mcr.microsoft.com/devcontainers/*` images. The language server ships inside the container via the extension's `serverApplication` mechanism; the browser gets a thin LSP client. ([Ona container configuration](https://www.gitpod.io/docs/ona/configuration/devcontainer/overview))
- **Sourcegraph** is the cautionary tale. Their in-browser TypeScript language server, `sourcegraph/javascript-typescript-langserver`, is **archived and unmaintained since 2020-10-16** ([GitHub API](https://github.com/sourcegraph/javascript-typescript-langserver)). They moved to server-side code intelligence.
- **Replit** and **Codespaces** use the same server-side container model; the browser is always a client.

**The industry consensus is unambiguous: real language intelligence runs server-side in a container, and the browser is an LSP client.** There is no cloud IDE shipping WASM language servers.

### 3.3 Devcontainer "language server" images: they do not exist

I checked for a maintained prebuilt image bundling full language servers:

- The `devcontainers/features` repository contains **28 features** (I enumerated them from the repo tree). They are **toolchains and utilities** — `python`, `go`, `java`, `rust`, `ruby`, `php`, `dotnet`, `node`, `nix`, `git`, `github-cli`, `aws-cli`, `kubectl-helm-minikube`, `terraform`, `docker-in-docker`, and so on. **There is no `language-server-pack` feature.**
- `ghcr.io/devcontainers/features/python` exists (53 tags) and `mcr.microsoft.com/devcontainers/python` exists (1,830 tags), but no language-server image exists at `devcontainers/containers/language-server-pack` or `devcontainers/features/language-server-pack` (both 404).
- GitHub search for `devcontainer language-server-pack` returns **0 results**.

**Conclusion: there is no maintained "language server pack" devcontainer image to fork.** The realistic equivalent is a per-language base image (`mcr.microsoft.com/devcontainers/python`, `/go`, `/java`) plus explicitly installed analyzers. The base images give you a toolchain and a warmed filesystem; the analyzers are yours to add.

### 3.4 Concrete recommended per-language tool table

Costs assume a pre-warmed image (see §5 for why this matters). Latency and memory are my measurements (§4); where a tool needs a persistent server, the latency is **per request after warm-up**, not per invocation.

| Language | Tool | License | Output format | Single-file latency | Peak RSS | Install cost |
| --- | --- | --- | --- | --- | --- | --- |
| **Python** | `pyright --outputjson` | MIT | JSON object: `generalDiagnostics[]`, `summary`, `time`, `version` | **292 ms** | 154 MB | 6.2 MB wheel (bundles Node) |
| **Python** | `ruff check --output-format=json` | MIT | JSON array of `{code, filename, location, end_location, message}` | **10 ms** | 16 MB | 12 MB static binary |
| **Python** | `mypy --output=json` | MIT | **JSONL** (one object per line, not an array) | **83 ms** | 41 MB | pip + `mypy_extensions` |
| **C / C++** | `clangd` (LSP) | Apache-2.0 w/ LLVM exceptions | LSP `textDocument/publishDiagnostics` | 50 ms CLI check (no JSON) | 49 MB | ~1–2 GB with system headers |
| **C / C++** | `clang-tidy` | Apache-2.0 w/ LLVM exceptions | `-export-fixes` YAML / custom | not measured | — | shares clang install |
| **Go** | `gopls check` | BSD-3-Clause | JSON per file | **unverified** (no Go toolchain available) | unverified | Go SDK + `go mod download` |
| **Java** | `eclipse.jdt.ls` | EPL-2.0 | LSP only | unverified | unverified | JRE + Gradle/Maven model |
| **Rust** | `rust-analyzer` | MIT OR Apache-2.0 | LSP only | unverified | unverified | rustc/cargo + `cargo metadata` |
| **Ruby** | `solargraph` | MIT | LSP / socket | unverified (expected seconds) | unverified | Ruby gem tree, large |
| **PHP** | `phpstan analyse --error-format=json` | MIT | JSON: `totals` + `files[].messages[]` | unverified (no PHP available) | unverified | PHAR or Composer, needs PHP |
| **PHP** | `intelephense` | MIT (client) | LSP only | unverified | unverified | 25.9 MB npm bundle |
| **shell** | `shellcheck --format=json` | **GPL-3.0** | JSON array: `code, file, line, endLine, column, endColumn, level, message, fix` | **20 ms** | 27 MB | 72 MB installed |
| **all** | `typos --format=json` | Apache-2.0 | **JSONL**: `{type, path, fixes[]}` | **14 ms** | 33 MB | 11.5 MB single binary |

### 3.5 Licensing flags

Two copyleft tools in the list deserve an explicit decision:

- **`shellcheck` is GPL-3.0.** I confirmed this from the binary itself (`shellcheck --version` → `license: GNU General Public License, version 3`) and the repo (SPDX `GPL-3.0`, 40k stars). Invoking it as a separate process and consuming its JSON output is the ordinary way GPL tools are used, and the output is not a derivative work. This is very likely fine, but it is a legal call, not an engineering one, and the app ships GPL-licensed tree-sitter grammars already under a different regime.
- **`golangci-lint` is GPL-3.0** (verified). It is also redundant given gopls. Rejected on both counts.
- Permissive and safe: pyright (MIT), ruff (MIT), mypy (MIT), phpstan (MIT), typos (Apache-2.0), rust-analyzer (MIT/Apache-2.0 dual), gopls (BSD-3), jdtls (EPL-2.0, weak copyleft, fine for server-side), intelephense (MIT — note the npm manifest says `SEE LICENSE IN LICENSE.txt`, but I read the actual `LICENSE.txt` and it is MIT).
- **`rope` is LGPL-3.0-or-later** (verified from PyPI classifiers). Relevant only if you consider it as a Python refactoring engine; it is not a diagnostics source.

---

## 4. Measured latency and memory

Measured on macOS arm64, Python 3.13.9 / Node 24.14.0 / LLVM 22.1.8 (Homebrew). Three runs per tool; the table reports cold (first) and warm median.

| Tool | Cold | Warm median | Peak RSS | Output verified |
| --- | --- | --- | --- | --- |
| `typos --format=json .` | 15 ms | **14 ms** | 33 MB | JSONL, one record per line |
| `ruff check --output-format=json` | 239 ms | **10 ms** | 16 MB | JSON array, 4 diagnostics found |
| `shellcheck --format=json` | 22 ms | **20 ms** | 27 MB | JSON array, keys `code/column/level/message` |
| `mypy --output=json` | 1005 ms | **83 ms** | 41 MB | JSONL; caught the `str`→`List[str]` mismatch |
| `clangd --check=bare.c` | 57 ms | **50 ms** | 49 MB | Found 1 error, but **not as JSON** |
| `pyright --outputjson` | 373 ms | **292 ms** | 154 MB | JSON object, 1 real type diagnostic |

**How to read these numbers — and how not to:**

- These are **warm-local** figures on an already-installed toolchain with a warm page cache. They are a fair proxy for *steady-state analyzer cost in a pre-warmed sandbox*.
- They are **not** a fresh-sandbox measurement. A cold container additionally pays image pull (or snapshot restore), tool installation, and first-run cache population. `mypy`'s 1,005 ms cold run — 12× its warm time — is a direct measurement of that cache-warming penalty. Budget for it.
- A ~20-line fixture is the easy case. Analyzer cost scales with **project size**, not file size, because the whole point is cross-module resolution. Pyright on a real repository routinely needs 500 MB–1 GB. Do not extrapolate the 154 MB figure to a large project.
- The **quality** difference is the real story. On the same Python fixture, ruff reported 4 findings (an unused import `os`, deprecated `typing.List` import, an unused local) in 10 ms; pyright reported 1 finding — the genuine type error — in 292 ms. **They are complementary, not substitutes.** Ruff gives fast, cheap, high-volume lint; pyright gives the semantic truth the request is actually asking for.

---

## 5. Recommended architecture

### 5.1 The decision

**Do not pursue in-app language servers.** There are no WASM builds, the memory ceiling forecloses the native ones, and the industry has converged on server-side. Keep tree-sitter for syntax.

**Server-side analyzers are the right answer for error quality, but they contradict the app's current offline, no-cloud-execution contract and require a product decision before any code is written.** The rest of this section is conditional on that decision being made in the affirmative.

### 5.2 If the decision is yes: the shape

1. **One analyzer process per language, driven over LSP, not via CLI check modes.** §3.1 shows the CLI JSON output is unreliable for clangd. Use `monaco-languageclient` (0.33 MB, MIT) in the WebView against a sandbox-side LSP endpoint for the heavy languages (C/C++, Java, Rust, Ruby, PHP), and use **one-shot CLI JSON** only for the tools where I verified stable machine-readable output: pyright, ruff, mypy, shellcheck, typos, phpstan.

2. **Ship pre-warmed images per language, not an on-demand install.** A per-language snapshot is what makes the latency in §4 achievable. Installing pyright or a JDK inside a fresh container on the critical path would blow the interactive budget by an order of magnitude — `mypy`'s measured 1,005 ms cold run is the scale of that penalty for the *cheapest* case. The MCR devcontainer base images (`/python`, `/go`, `/java`, plus `devcontainers/features` for `rust`, `php`, `ruby`) are the right starting point; there is no prebuilt language-server image to fork (§3.3).

3. **Layer ruff and pyright together for Python.** They answer different questions and the measured cost of running both is ~300 ms warm.

4. **Treat diagnostics as a debounced background task, not an inline linter.** The existing `analyzer-registry` contract already returns `ready | unavailable | unsupported` and the Problems sheet already handles async status. Server-side results are strictly slower than the current 100 ms tree-sitter parse budget and must not block the editor.

5. **Preserve the existing offline tier as the default.** Tree-sitter stays as the synchronous baseline so that a user with no network, or a language with no configured sandbox, still gets syntax findings. Server-side diagnostics are an enhancement layer, never a prerequisite. This keeps the current `language-diagnostics-coverage.md` contract intact.

### 5.3 The cheaper alternative worth serious consideration

Before building sandbox infrastructure, note that a large fraction of the request's symptom list — *undefined names, unused imports* — is reachable **without any type checker and without a server**:

- `ruff`'s pyflakes rules (`F821` undefined name, `F401` unused import) run in **10 ms and 16 MB** and are MIT.
- A Tree-sitter-globals pass over syntax trees can do the same for any language with a grammar, deterministically and offline, with no sandbox at all.

The repo already has untracked work along these lines: [`src/features/code-intelligence/parsers/tree-sitter-globals.ts`](../src/features/code-intelligence/parsers/tree-sitter-globals.ts) and `tests/python-diagnostics-precision.test.ts`. This will not give you true type checking — and the request explicitly wants type errors — but it captures a large share of the perceived value at a fraction of the cost and complexity, with no product-contract violation. **It is the recommended first step regardless of how the sandbox decision goes.**

---

## 6. Rejected options

| Option | Why rejected |
| --- | --- |
| **LSP4Web** | Does not exist. Zero GitHub repos, no npm package, no Open VSX extension. Likely a confusion with Eclipse LSP4E. |
| **WASM builds of gopls / clangd / rust-analyzer / jdtls** | Do not exist and are not plausible. These are native toolchain-bound binaries. |
| **Pyright in the WebView or Hermes** | The npm package declares `engines.node >= 14`, has no `browser` field, and depends on `fsevents`. It is a Node CLI, not a browser library. Confirmed against the 1.1.414 manifest. |
| **Solargraph in-app** | Requires a full Ruby VM and a large gem tree. Seconds of boot against a per-keystroke budget. |
| **python-lsp-server / pylsp** | Its diagnostics are pyflakes-level — no type inference. Strictly dominated by ruff (same pyflakes rules, 8× faster, MIT) and pyright. |
| **Devcontainer "language server pack" images** | Do not exist. `devcontainers/features` has 28 features, all toolchains/utilities; the `language-server-pack` path 404s on both ghcr.io and mcr.microsoft.com, and GitHub search returns 0. |
| **golangci-lint** | GPL-3.0, and redundant given gopls. |
| **Revive (Go linter)** | MIT and maintained, but a linter, not a type checker; gopls covers the type errors the request is about. |
| **A persistent always-on LSP per language** | The agent's own architecture already demonstrated the failure mode: `workspace-task` serializes tools and blocks on durable waitpoints, and its `retry` is `maxAttempts: 1`. Long-lived per-language servers would need their own lifecycle, concurrency, and cost model that does not exist in this codebase. |
| **Using a WebView for diagnostics orchestration** | The app's own `AGENTS.md` records that Hermes lacks several Web APIs, and its `AbortSignal` rules exist because DOM types overstate what the native runtime provides. Building the primary path on WebView-only APIs repeats a solved problem. |

---

## 7. Verification status

**Verified directly:**
- Existence, version, license, unpacked size, and publish date for: `pyright`, `ruff`, `mypy`, `basedpyright`, `python-lsp-server`, `pyflakes`, `rope`, `flake8` (PyPI); `solargraph`, `rubocop` (RubyGems); `bash-language-server`, `cspell`, `intelephense`, `monaco-editor`, `monaco-languageclient`, `vscode-languageclient`, `web-tree-sitter`, `vscode-pyright`, `vscode-json/css/html-languageservice`, `monaco-typescript` (npm registry).
- Licenses read from source: mypy (MIT), ruff (MIT), phpstan (MIT), typos (Apache-2.0), shellcheck (GPL-3.0), rust-analyzer (MIT + Apache-2.0), gopls/x/tools (BSD-3), intelephense (MIT), rope (LGPL-3.0-or-later).
- GitHub API: `astral-sh/ruff` (49.8k stars, MIT), `eclipse-jdtls/eclipse.jdt.ls` (EPL-2.0), `castwide/solargraph` (MIT, commits 2026-09-26), `sourcegraph/javascript-typescript-langserver` (**archived, last push 2020-10-16**), `vscode-pyright` (npm last modified 2024-05-11 — stale; the `pyright` package supersedes it).
- Container registries: `devcontainers/features` repo tree (28 features, enumerated); `ghcr.io/devcontainers/features/python` (53 tags); `mcr.microsoft.com/devcontainers/python` (1,830 tags); 404 for both language-server-pack paths.
- Measured: latency (cold + warm median, 3 runs) and peak RSS for pyright, ruff, mypy, clangd, shellcheck, typos; actual output shape and JSON keys for each; the `clangd` CLI flag incompatibility and its non-JSON output on LLVM 22.1.8.
- Repo state: no persistent Daytona workspace; agent tool set contains no shell execution; the agent executes on-device via Trigger.dev waitpoints; only optional BYO-key ephemeral Daytona execution remains.

**Verified from official documentation (read, not executed):**
- VS Code's UI-Extension vs. Workspace-Extension split under Remote Development / Codespaces.
- Ona (formerly Gitpod) container configuration: devcontainer base images + `customizations.vscode.extensions`, and the recommended `mcr.microsoft.com/devcontainers/*` images.
- Gitpod → Ona rebrand (gitpod.io documentation URLs now resolve to ona.com).

**Could NOT verify — flagged in the tables above:**
- Latency, memory, and output format for **gopls, eclipse.jdt.ls, rust-analyzer, solargraph, phpstan, intelephense**. No Go, Java, Rust, Ruby, or PHP toolchain was available in the research environment, so I did not measure these. The install-cost and "must run as a persistent LSP server" assessments for them are reasoned from their architecture, not measured. **Run these benchmarks before committing to a design.**
- Whether any of the above have undocumented WASM builds. I found none via GitHub search and registry inspection, but absence of evidence in a public search is weaker than a vendor confirmation.
- Whether the Sandbox provider in question can actually host long-lived processes and what its per-sandbox resource limits and idle timeouts are. This determines whether the persistent-LSP approach in §5.2 is even possible, and it is the single most important unknown in this document.
- Whether `cspell` is appropriate here. It is a spell checker, MIT, and it is what several cloud setups use; I verified its existence and license but did not assess its diagnostic value for this use case.

**One recommendation on process:** the highest-value next step is not more research. It is running `gopls check`, `phpstan analyse --error-format=json`, and a `rust-analyzer` / `jdtls` LSP session in a real sandbox, and measuring cold-start, warm latency, and peak memory. Those five numbers will settle the architecture. Everything in §5 is provisional on them.
