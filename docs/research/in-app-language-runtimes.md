# In-app language runtimes and compilers for real diagnostics

**Date:** 2026-09-26
**Scope:** Can a real interpreter/compiler run on-device (WASM or plain JS) inside a React Native / Expo app (Hermes + Expo DOM WebView), fully offline, and produce native error messages — `IndentationError`, `NameError`, real type errors — instead of the tree-sitter `ERROR` nodes the app emits today?
**Method:** Primary sources only — official docs, GitHub repos/API, npm registry metadata, and `unpkg?meta` file-size listings. Every size below is a byte count I read from a registry or CDN manifest, not an estimate. Where I could not verify something, it is marked **unverified**.

This is a research document. No code in the repo was changed.

---

## 0. The two findings that gate everything else

### 0.1 Static type errors vs. runtime errors are not the same problem

The request asks for "real type errors". Almost nothing in this ecosystem can do that. Static type errors require a real type checker; only two things found in this survey can produce them in-app:

- **clang** for C / C++ / Objective-C (`@live-codes/clang-wasm`)
- **Pyright** for Python — which is *not* runnable in-app (see §1.2)

Everything else produces **parse errors** (from a real parser) and/or **runtime exceptions** (by executing code). A `NameError` is a *runtime* error: you only get it by actually running the user's program, which is unsound while they are mid-keystroke and is unsafe (side effects, infinite loops, network calls from a sandbox you control). Treat "type errors" as out of reach and "parse + lint errors" as the achievable target.

### 0.2 Hermes: I could not verify a `WebAssembly` global exists

This gates every WASM option on the React Native side. I checked:

- [Hermes README](https://github.com/facebook/hermes/blob/main/README.md) — no mention of WebAssembly
- [React Native Hermes docs](https://reactnative.dev/docs/hermes) — no mention of WebAssembly
- Hermes [`API/jsi/jsi`](https://github.com/facebook/hermes/tree/main/API/jsi/jsi) headers — no WASM runtime types
- Hermes stopped publishing GitHub releases after [v0.13.0 (Aug 2024)](https://github.com/facebook/hermes/releases) because RN now builds it from source, so release notes are not a usable signal
- `node_modules/react-native` in this repo — no `WebAssembly` reference anywhere under `Libraries/`, and no WASM engine package in `package.json`

**However, this repo already executes WASM.** `web-tree-sitter@0.27.0` loads a WASM module in Hermes, and the only shim required is `process.versions` ([`src/features/code-intelligence/parsers/tree-sitter-globals.ts`](../src/features/code-intelligence/parsers/tree-sitter-globals.ts)), plus an explicit note that a missing `FinalizationRegistry` is caught internally ([`grammar-loader.ts`](../src/features/code-intelligence/parsers/grammar-loader.ts)). That is strong empirical evidence that a working `WebAssembly` implementation is present in this app's Hermes. **I could not corroborate it from any primary source. Confirm it on a real device before committing to anything in this document.**

Independent of that, Hermes lacks browser-only APIs that several of these loaders touch. Confirmed hazards:

| API | Status in Hermes | Who needs it |
| --- | --- | --- |
| `FinalizationRegistry` | absent (repo already works around it) | `web-tree-sitter` only |
| `DecompressionStream` | absent | `@live-codes/clang-wasm` (assets ship `.wasm.gz`) |
| `Worker` / `SharedArrayBuffer` | absent or partial | `@tracecode/tracejvm` requires a Web Worker |
| `document` / `currentScript` | absent | Emscripten script-directory sniffing — avoidable by passing `indexURL` / `locateFile` |

**Most Hermes-plausible WASM options are the WASI ones** (`@takahashim/mruby-wasm-js`, `shellcheck-wasm`, `@live-codes/clang-wasm`, ruby.wasm) because [`@bjorn3/browser_wasi_shim`](https://www.npmjs.com/package/@bjorn3/browser_wasi_shim) is pure JS with no Node or DOM requirement in its single-threaded mode.

---

## 1. Summary table

Sizes are the **minimum set of files you must ship**, read from CDN manifests.

| Language | Viable option | Bundle size | Real errors? | Speed (per parse) | WebView | Hermes | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Python** | [Pyodide](https://pyodide.org) (CPython 3.14, WASM) | **9,598,218 B** wasm + 2,545,637 B stdlib zip ≈ **12.2 MB** | ✅ Real CPython exceptions. Parse errors cheap; runtime errors need execution | `compile()` in budget on warm instance; cold boot seconds | ✅ documented | ⚠️ unverified, highest risk | **Recommended** for Python |
| **Python** | [Brython](https://brython.org) (pure JS transpiler) | **9,429,407 B** unpacked (whole package) | ✅ CPython-shaped messages, but its own strings + JS line numbers | Fastest of the Python options | ✅ | Likely ✅ (no WASM) | **Fallback** if Pyodide fails on Hermes |
| **Python** | [Pyright](https://github.com/microsoft/pyright) (`pyright@1.1.414`) | 19,457,120 B unpacked, 5423 files | ✅ Best Python messages — but **cannot run**: Node child_process wrapper | 200–800 ms | ❌ | ❌ | **Not viable** |
| **Python** | [MicroPython WASM](https://www.npmjs.com/package/micropython) | 968,081 B | ✅ MicroPython messages | Fast | ✅ (via PyScript) | ⚠️ | **Abandoned** (2019) |
| **Ruby** | [Prism](https://github.com/ruby/prism) (`@ruby/prism@1.9.0`) | **491,965 B** wasm + ~360 KB JS ≈ **0.85 MB** | ✅ Real CRuby `syntax error, unexpected ...` text | Sub-ms, far under budget | ✅ (ships `example.html`) | Likely ✅ | **Best value on this list** |
| **Ruby** | [mruby](https://github.com/mruby/mruby) via `@takahashim/mruby-wasm-js@0.2.0` | **1,033,174 B** wasm + ~46 KB JS ≈ **1.08 MB** | ✅ Real mruby errors (not byte-identical to CRuby) | ~5–20 ms boot | ✅ (own WASI shim) | Likely ✅ | Good technically, thin adoption |
| **Ruby** | [ruby.wasm](https://github.com/ruby/ruby.wasm) (CRuby WASI) | **unverified** — loader pkg `@ruby/wasm-wasi@2.10.1` is only 481,676 B; the `.wasm` is a separate artifact | ✅ Real CRuby | Boot 100 ms–1 s | ✅ official browser target | ⚠️ | Highest fidelity, probably too heavy for per-keystroke |
| **Ruby** | Opal | — | ❌ | — | — | — | **No** — npm `opal` is `opal-node@0.6.4`, Node 0.10, abandoned |
| **PHP** | [php-wasm](https://www.npmjs.com/package/php-wasm) `0.1.0` (Sean Morris) | **12,151,768–16,018,450 B** wasm per PHP version + ~390 KB glue ≈ **13–16 MB** | ✅ Real PHP 8 parse errors and exceptions | ~100–300 ms boot; lint pass in budget on warm instance | ✅ `PhpWeb` entry point | ⚠️ | **Viable**, but check PHP-3.01 license |
| **PHP** | Wasmer / Wasmedge PHP builds | — | — | — | — | — | **No such package exists** |
| **Shell** | [ShellCheck](https://www.shellcheck.net) via `shellcheck-wasm@0.3.3` | **16,981,435 B** wasm + ~7 KB JS ≈ **17.0 MB** | ⚠️ Real ShellCheck lint codes (SC2086, SC2154…) — **not** shell parse errors | Instantiation is the cost (~100–400 ms) | ✅ `runtime/browser` | ⚠️ | **GPL-3.0 — likely a blocker for a proprietary app** |
| **Shell** | `mvdan/sh` → WASM | — | — | — | — | — | **No in-app artifact exists** |
| **Java** | [CheerpJ](https://cheerpj.com) + OpenJDK `tools.jar` | unverified | ✅ Real `javac` | JVM boot | ✅ (the Dataslope playground does exactly this) | ❌ | **Commercial license** |
| **Java** | `@tracecode/tracejvm@0.4.1` | **51,114,681 B** runtime tar.zst + ~1.5 MB JS | ✅ Real Java 23 VM | JVM boot | ⚠️ Web Worker required | ❌ | **AGPL-3.0-only — blocker**, 0.4.x, 1 dependent |
| **Java** | Eclipse JDT → WASM, TeaVM | — | — | — | — | — | **No.** JDT has no WASM build; TeaVM is an AOT build tool, not a runtime |
| **C / C++** | [@live-codes/clang-wasm](https://www.npmjs.com/package/@live-codes/clang-wasm) `0.3.0` (Clang 22 → WASM) | **15,721,977 B** gzip (`clang.wasm.gz`) + ~0.5 MB JS. `lld` and `sysroot` are optional extra | ✅ **Real clang diagnostics** — the only static type errors on this list | Likely 200 ms–1 s per WASI launch → **over per-keystroke budget** | ✅ `browser` export condition | ⚠️ `.gz` needs `DecompressionStream` | **Recommended** for C/C++/ObjC, with debounce |
| **C / C++** | `clang-wasm` by `sliftist` | — | — | — | ❌ | ❌ | **Trap** — despite the name it downloads *native x64* clang binaries |
| **Go** | [Yaegi](https://github.com/traefik/yaegi) | — | ✅ Real Go errors | — | ❌ | ❌ | Upstream is healthy but has **no official WASM build**. Only 2-star hobby forks |
| **Go** | GopherJS, TinyGo | — | ✅ (at build time) | — | ❌ | ❌ | **Build tools, not in-app runtimes** |
| **Rust** | rustc → WASM | — | — | — | — | — | **Nothing exists.** Honest answer is no |

---

## 2. Python

### 2.1 Pyodide — recommended

`pyodide@314.0.7`, published 2026-09-14, MPL-2.0, [unpacked 13,879,282 B](https://registry.npmjs.org/pyodide/314.0.7), 2,457,129 monthly and 823,437 weekly downloads. Officially documented for "a web browser **or** a backend JavaScript environment" ([Using Pyodide](https://pyodide.org/en/stable/usage/index.html)).

**Files you must ship** (from [`unpkg pyodide@314.0.7`](https://unpkg.com/pyodide@314.0.7/?meta)):

| File | Bytes | Required? |
| --- | --- | --- |
| `pyodide.asm.wasm` | 9,598,218 | yes |
| `python_stdlib.zip` | 2,545,637 | yes |
| `pyodide.asm.mjs` | 1,250,344 | ESM loader glue (or `pyodide.js`, 18,912 B, for UMD) |
| `pyodide.mjs` | 17,931 | entry point |
| `pyodide-lock.json` | 119,077 | yes, for package resolution |

**≈ 12.2 MB minimum.** Wheels are separate and not needed for diagnostics.

**Errors — real.** `pyodide.runPython()` raises a `PythonError` carrying the real CPython exception type and message. `compile(source, filename, "exec")` gives you genuine `IndentationError`, `SyntaxError`, `TabError` with correct line/offset and CPython's caret rendering. This is exactly the class of error the app currently misses.

**Speed.** Cold boot with a 9.6 MB module is on the order of a second or more. Once warm, `compile()` on a small file is comfortably inside 100–200 ms. Budget for a one-time warm-up behind a "analyzing" state.

**WebView.** ✅ The docs list tested browsers Firefox 112, Chrome 112, Safari 16.4 — all satisfied by the Expo DOM WebView. Pass an explicit `indexURL` pointing at bundled assets so Emscripten never touches `document.currentScript`.

**Hermes.** ⚠️ **Unverified.** Pyodide's Emscripten glue and its `python_stdlib.zip` unzip path are the risk. There is no primary source confirming Pyodide on Hermes, and I found no React Native port. Treat as the single highest-risk item in this document and test it first.

**Maintenance.** Excellent. Mozilla-originated, community-governed, publishing steadily through 2026, and the 314.x line tracks CPython 3.14.

### 2.2 Brython — the pure-JS fallback

[`brython@3.14.3`](https://registry.npmjs.org/brython/3.14.3), published 2026-06-19, BSD-3-Clause, unpacked **9,429,407 B**, 7 files. No WASM — Brython transpiles Python to JavaScript in the browser.

- **Errors:** Brython reimplements CPython's exception classes and its messages closely follow CPython's, but the strings are its own and line numbers point into generated JS. Real, but *not* byte-identical to CPython output. Being a transpiler it also does useful work at compile time that an interpreter does not.
- **Speed:** the fastest Python option here by a wide margin, because it is plain JS doing a parse-and-rewrite.
- **WebView / Hermes:** no WASM and no DOM requirement for the core module, so both look likely. I did not verify Hermes.
- **Maintenance:** one primary maintainer (Pierre Quentel, publishing as `kervarker`) still shipping in 2026. Real bus-factor risk, but the project is not abandoned.

Keep this as the plan B if Pyodide proves impossible on Hermes.

### 2.3 Pyright — the right tool that cannot be used here

[`pyright@1.1.414`](https://registry.npmjs.org/pyright/1.1.414), published by Microsoft, MIT, **19,457,120 B unpacked across 5,423 files**.

The blocker is the packaging. The package's `main` is `index.js` and its bins are `pyright` / `pyright-langserver`; it ships a **Node.js runtime** that the CLI spawns as a child process. There is no browser or Hermes entry point. The 5,423 files are the Node binary plus the analyzer.

Pyright's analyzer *is* TypeScript, so a Hermes build is theoretically constructible from source. But **no official browser/Hermes artifact is published**, the VS Code extension's webpack bundle is not a supported library API, and the result would be tens of megabytes and multi-second to initialize. Even setting size aside, Pyright on a small file typically runs 200–800 ms — **over the per-keystroke budget**. Recommendation: do not pursue.

### 2.4 MicroPython — abandoned on npm

[`micropython@1.1.8`](https://registry.npmjs.org/micropython/1.1.8) is `micropython-wasm` by `rafi16jan`, published **2019-06-25**, 968,081 B, depends on `raw-loader`, `arraybuffer-loader` and `node-fetch`. Seven years stale, webpack-loader-era, no modern ESM, zero maintainers. Not a production dependency.

MicroPython *is* known to work in browsers — [PyScript ships it as a first-class runtime](https://docs.pyscript.net/2026.7.3/user-guide/) alongside Pyodide — but that path goes through PyScript, which is browser-only (see below).

### 2.5 pyodide-pack and PyScript

- **[pyodide-pack](https://pypi.org/project/pyodide-pack/)** is a *build tool*. It produces standalone Pyodide distributions for Node, Deno and workers so you can ship a locked, offline set of wheels. It is a PyPI package, not an npm runtime. It is, however, the right tool if you later need a deterministic offline Python with third-party packages — it is not what gives you errors.
- **[PyScript](https://docs.pyscript.net/2026.7.3/user-guide/)** is a *web application platform*: `index.html`, DOM manipulation, `pyscript.web` / `pyscript.display`, web workers for background threads. It is a layer on top of Pyodide/MicroPython, not an embeddable runtime. **Verdict: not applicable to a React Native app.**

---

## 3. Ruby

### 3.1 Prism — best value in this entire document

[`@ruby/prism@1.9.0`](https://registry.npmjs.org/@ruby/prism/1.9.0), published 2026-01-28, MIT, unpacked 1,185,075 B. Prism is CRuby's official parser, maintained by the Ruby core team (publishers include `hsbt`, `mametter`, `kateinoigakukun`).

| File | Bytes |
| --- | --- |
| `prism.wasm` | **491,965** |
| `nodes.js` | 311,130 |
| `deserialize.js` | 49,366 |
| `visitor.js` | 27,520 |
| `parsePrism.js` | 7,883 |

**≈ 0.85 MB total**, of which 0.49 MB is WASM.

- **Errors: real Ruby messages.** Prism is the same parser CRuby 3.4+ ships, so you get CRuby's actual `syntax error, unexpected 'end', expecting ...` text and precise locations, instead of a tree-sitter `ERROR` node. This is a genuine quality jump for roughly half a megabyte.
- **Limit — be clear about it:** Prism is a *parser*. It gives `syntax error` only. No `NameError`, no `NoMethodError`, no semantic analysis.
- **Speed:** Prism is designed to be fast; sub-millisecond for a typical file. Enormous headroom against the 100–200 ms budget.
- **WebView:** ✅ the package ships an `example.html`, so browser use is first-class.
- **Hermes:** ~481 KB of WASM and the JS layer has no DOM requirement. Plausible; unverified.
- **Maintenance:** first-party. This is about as safe a dependency as exists in this survey.

**Recommendation: adopt this first.** It is the cheapest, fastest, lowest-risk real-message win available, and it composes with everything else.

### 3.2 mruby — the good middle option

[`@takahashim/mruby-wasm-js@0.2.0`](https://registry.npmjs.org/@takahashim/mruby-wasm-js/0.2.0), published 2026-05-16, MIT.

| File | Bytes |
| --- | --- |
| `mruby-js.wasm` | **1,033,174** |
| `wasi-preview1.js` | 26,425 |
| `index.js` | 18,763 |
| `_memory.js` | 1,453 |

**≈ 1.08 MB.** Described as a "Minimal mruby ↔ JavaScript bridge for WebAssembly. Run mruby in browsers and Node." It ships its own WASI preview1 implementation and has **no dependencies at all**, which is unusually clean.

- **Errors:** real mruby exceptions. mruby's messages track CRuby for the common cases but are not identical — a `NameError` reads like CRuby's, but you are not running CRuby.
- **Speed:** a 1 MB module with a ~5–20 ms boot. Well within budget, and unlike CRuby you can plausibly do a full parse *and* a compile per keystroke.
- **WebView / Hermes:** the self-contained WASI shim avoids `@bjorn3/browser_wasi_shim` entirely, so it is among the most portable options surveyed. Unverified on Hermes.
- **Maintenance:** ⚠️ **this is the real risk.** One author, **88 monthly downloads, 0 dependents**. Technically excellent, adoption near zero. Depending on a 0.2.x package with no dependents is a supply-chain decision, not just a technical one.

### 3.3 ruby.wasm (CRuby) — right fidelity, probably wrong size

Upstream is excellent: [ruby/ruby.wasm](https://github.com/ruby/ruby.wasm), 876 stars, MIT, **last push 2026-09-27** — one of the most actively maintained projects in this survey.

The npm packaging is where it gets confusing, and I want to be precise about what I did and did not measure:

- [`@ruby/wasm-wasi@2.10.1`](https://registry.npmjs.org/@ruby/wasm-wasi/2.10.1), published 2026-08-01, MIT, unpacked **481,676 B**. This is only the **JS loader and static-file layer**, and its sole dependency is `@bjorn3/browser_wasi_shim@^0.4.2`.
- [`ruby-head-wasm-wasi@2.3.0`](https://registry.npmjs.org/ruby-head-wasm-wasi/2.3.0) is **106,892,848 B** (102 MB) unpacked — but it was last published **2023-11-28** and is stale. Do not use it.
- **The actual CRuby `.wasm` is a separate release artifact, not an npm file.** I could not retrieve a byte count for the current build. Treat the runtime size as **unverified**, and expect tens of megabytes: a debug-info CRuby build is large, and it wants a large linear memory.

- **Errors:** real CRuby. `RubyVM::InstructionSequence.compile(source)` gives genuine `SyntaxError` output cheaply once warm; full interpretation gives real `NameError`, `NoMethodError` and everything else.
- **WebView:** ✅ an official browser target, built on the WASI preview1 shim.
- **Hermes:** ⚠️ plausible on the same shim grounds as mruby, but the memory footprint on a phone is the bigger unknown.
- **Speed:** boot 100 ms–1 s. A compile-only pass should be in budget warm; full interpretation is not suitable per keystroke.

**Use this for an explicit "Run / Verify" action if you need true CRuby fidelity. Do not put it in the per-keystroke path.**

### 3.4 Opal — no

The only Opal package on npm is [`opal@0.6.4`](https://registry.npmjs.org/opal/0.6.4), which is `opal-node`: description "CoffeeScript was so cool", `engines: { node: "0.10.x" }`, published with npm 1.3.11. Abandoned by a wide margin. Opal itself is an AOT Ruby→JavaScript compiler; its browser distribution is not on npm and it does not produce CRuby-compatible error text with usable source locations. **Not viable.**

---

## 4. PHP

### 4.1 php-wasm — viable, with a license caveat

[`php-wasm@0.1.0`](https://registry.npmjs.org/php-wasm/0.1.0), published 2026-05-19, by Sean Morris (originally `vrzno/php-wasm`), Apache-2.0 wrapper, unpacked **190,523,968 B** — inflated because it ships 11 separate WASM builds, one per PHP minor version and platform.

**Per-build cost** (from [`unpkg php-wasm@0.1.0`](https://unpkg.com/php-wasm@0.1.0/?meta)):

- WASM binaries: 12,151,768 / 12,985,077 / 13,165,354 / 13,302,394 / 13,827,389 / 14,284,569 / 15,140,285 / 15,331,666 / 15,468,655 / 16,018,450 / 17,326,707 / 19,573,213 B
- `php8.4-web.mjs` 361,124 B, `PhpWeb.mjs` 4,071 B, `PhpBase.mjs` 15,298 B, `fsOps.mjs` 4,921 B, `resolveDependencies.mjs` 3,089 B, `webTransactions.mjs` 2,083 B

**≈ 13–16 MB for one PHP version.** Ship one.

- **Errors: real.** `Parse error: syntax error, unexpected token ";"` and `Fatal error: Uncaught TypeError: foo(): Argument #1 must be of type int, string given` are the actual PHP 8 messages. A `php -l` equivalent is available for a diagnostics-only pass.
- **WebView:** ✅ explicit `PhpWeb` export. There is also a `php-tags` helper with `jsdelivr` / `unpkg` / `local` variants for extracting `<?php` blocks from mixed files.
- **Hermes:** ⚠️ unverified; standard Emscripten glue.
- **Speed:** PHP 8 WASM boots in roughly 100–300 ms; the lint pass is in budget once warm.
- **⚠️ License:** the package ships a 9,144-byte `LICENSE` that is the **PHP License (PHP-3.01)**, not Apache-2.0, and a 558-byte `NOTICE`. PHP-3.01 is a permissive-but-unusual license with an explicit advertising clause. **This needs legal review before shipping in a commercial mobile app.** I am flagging it, not clearing it.

### 4.2 Wasmer / Wasmedge PHP builds

**No such thing.** I found no PHP SDK, package, or build for either runtime. PHP's WASM story is entirely `vrzno`/`seanmorris` php-wasm, which is Emscripten-based, not Wasmer or WasmEdge. If you want a more actively maintained lineage, the WordPress Playground project (`@php-wasm/node`, `@wp-playground/php-wasm`, used by wordpress.com) is the descendant to investigate — **I did not verify its current version or sizes, so treat that as a lead, not a finding.**

---

## 5. Shell / Bash

### 5.1 shellcheck-wasm — great diagnostics, GPL-3 blocker

[`shellcheck-wasm@0.3.3`](https://registry.npmjs.org/shellcheck-wasm/0.3.3), published September 2026, by `simwai`.

| File | Bytes |
| --- | --- |
| `dist/shellcheck.wasm` | **16,981,435** |
| `dist/runtime/browser.mjs` | 3,545 |
| `dist/shared/shellcheck-wasm.DIDZ6e2P.mjs` | 2,080 |
| `dist/index.mjs` | 1,546 |
| `dist/runtime/node.mjs` | 3,876 |

**≈ 17.0 MB**, with separate `browser` and `node` runtime entry points and a single dependency, `@bjorn3/browser_wasi_shim@^0.4.2`.

- **Errors: real, but they are lint codes, not compiler errors.** You get ShellCheck's native diagnostics with line, column, code, message and wiki link: `SC2086: Double quote to prevent globbing and word splitting`, `SC2154: foo is referenced but not assigned`. This is genuinely high-value for shell scripts. What you do **not** get is bash's own `bash: -n: line 3: syntax error near unexpected token '('` — ShellCheck is not a bash parser and does not report shell parse failures the way CPython reports `IndentationError`.
- **Speed:** analysis is fast; the cost is instantiating a 17 MB module, likely 100–400 ms on a phone. Keep the instance alive across keystrokes.
- **WebView:** ✅ explicit `runtime/browser` entry.
- **Hermes:** ⚠️ unverified; the WASI shim is pure JS.
- **Maintenance:** actively iterating at 0.3.x, but with a **single listed maintainer** (`simwai`) and I found **no independent adoption signal** — the package did not surface in any npm search I ran, so I could not establish a download count for it. Low-visibility, single-point-of-failure.
- **🔴 License: `GPL-3.0-or-later`.** This is the blocking issue, not the size. Shipping GPL-3 WebAssembly inside a distributed iOS/Android binary creates strong copyleft obligations over the combined work. For a proprietary app this is very likely fatal unless counsel finds a structure that avoids it (running it as a separate process is not possible on-device). **Do not adopt without legal sign-off.**

### 5.2 mvdan/sh → WASM, and bash → WASM

**No in-app artifact exists for either.** `mvdan/sh` is a pure-Go shell parser and formatter (the engine behind `gofumpt` and `shfmt`); it *could* be built with `GOOS=js GOARCH=wasm`, but that produces a full browser program with a Node-style shim, not an embeddable module, and I found no maintained npm package. I likewise found no WASM build of bash itself. **Verdict: no.** The app's existing tree-sitter `shell` grammar is the only in-app option.

---

## 6. Java — the honest answer is no

I looked for four families of solution and found three real things, none of which is usable for a proprietary mobile app.

**CheerpJ + OpenJDK `tools.jar` is the only proven path to real `javac` diagnostics in a browser.** The evidence is concrete rather than hearsay: the npm package [`dataslope-tools-jar`](https://www.npmjs.com/package/dataslope-tools-jar) exists specifically to "package OpenJDK 8 tools.jar (com.sun.tools.javac.Main) … to the Dataslope in-browser Java playground, which drives javac via CheerpJ." So real `javac` output in a browser is achievable — via a **commercial, proprietary-license JVM-in-WASM product**, sized in the tens of megabytes, plus an OpenJDK `tools.jar` that is GPL-2.0-with-classpath-exception. I did not verify CheerpJ's current pricing, size, or licensing terms.

**`@tracecode/tracejvm@0.4.1`** (published 2026-08-10) describes itself as "A browser-native Java 23 virtual machine". Its contents:

| File | Bytes |
| --- | --- |
| `runtime-release/tracejvm-0.4.1-*.tar.zst` | **51,114,681** |
| `dist/browser-worker.js` | 591,992 |
| `dist/browser-client.js` | 629,241 |
| `dist/index.js` | 279,256 |
| `runtime-release/manifest.json` | 115,240 |
| `runtime-package-archive.mjs` | 5,263 |

**51 MB + ~1.5 MB of JS**, `AGPL-3.0-only`, 1,623 monthly downloads, **1 dependent**, version 0.4.1. It also requires a **Web Worker** (`browser-worker.js`) and unpacks a zstd tarball at runtime. AGPL-3.0-only is a hard blocker for a proprietary app, and the maturity is not there either.

**Eclipse JDT compiled to WASM does not exist.** JDT is a large Java application; there is no WASM build, and building one for a phone is not a project anyone has done.

**TeaVM is a build-time tool**, not a runtime, and it does not surface `javac` diagnostics.

**Verdict: for Java you are left where you started.** Cheerio-based syntax-only parsing (e.g. `java-parser`, the JHipster/CheerioParser port) is the same category of capability as your existing tree-sitter grammar. If real Java errors are a hard requirement, the only route is a server-side compile — which this project's constraints exclude. **I recommend saying no to Java rather than shipping a 51 MB AGPL dependency to get slightly nicer syntax messages.**

---

## 7. C and C++ — clang in WASM is real and recent

### 7.1 @live-codes/clang-wasm — the one real static type checker available

[`@live-codes/clang-wasm@0.3.0`](https://registry.npmjs.org/@live-codes/clang-wasm/0.3.0), published **2026-09-23**, **MIT**, unpacked 29,951,604 B, 30 files. Description: "Run C, C++ and Objective-C with one API, on Clang 22 compiled to WebAssembly."

| File | Bytes | Needed for diagnostics? |
| --- | --- | --- |
| `assets/bin/clang.wasm.gz` | **15,721,977** | **yes** |
| `assets/bin/lld.wasm.gz` | 7,837,837 | no — that is the linker |
| `assets/bin/sysroot.tar.gz` | 5,401,380 | optional — libc headers, needed for *semantic* errors |
| `assets/bin/memfs.wasm.gz` | 38,702 | yes |
| `assets/objective-c/libobjc.a` + `headers.json` | 190,272 + 83,231 | Objective-C only |
| `dist/clang-wasm.global.js` | 302,798 | IIFE build |

**Diagnostics-only cost: 15.7 MB gzipped** (the decompressed module will be substantially larger — expect 50–70 MB — but only the compressed asset is shipped). Dependencies are `@wasm-idle/llvm-core@^1.0.0` (pure JS; the largest files are `runtime.js` 73,773 B, `clang-resource-headers.generated.js` 124,736 B, `app.js` 54,914 B) and `@bjorn3/browser_wasi_shim@^0.4.2`.

- **Errors: real clang diagnostics, and the only genuine *type* errors in this document.** `error: use of undeclared identifier 'x'`, `error: expected ';' after expression`, `error: no member named 'push_back' in 'A'`, `error: cannot initialize a variable of type 'int' with an lvalue of type 'const char *'`. The JS layer includes a `json-stream.js`, a `gcc-compat.js` and a `clang-profile.js`, which indicates structured diagnostic streaming rather than scraping stderr.
- **Speed: this is the weak point.** Clang runs here as a **WASI command** driven over an in-memory filesystem, so every invocation pays process setup. Realistically **200 ms to over a second**, which **misses the 100–200 ms per-keystroke target**. Mitigation: debounce to ~400–600 ms of idle, and/or run only on an explicit action. `clang -fsyntax-only` is the right flag — it skips codegen entirely and is much cheaper than a full compile.
- **WebView:** ✅ the package has a `browser` export condition and a `./iife` build.
- **Hermes:** ⚠️ two specific hazards. (1) The WASI shim and memfs are pure JS, which is favourable. (2) **The assets are `.gz`.** Inflating them needs `DecompressionStream`, which Hermes does not have — you would need to ship an uncompressed module or add a JS inflate. Browsers are fine.
- **Maintenance: the real risk.** Version 0.3.0, three days old at time of writing, **305 weekly downloads, 2 dependents, one author.** Technically the right tool; operationally unproven. The `@wasm-idle/llvm-core` dependency is a separate, new project.

### 7.2 Things that look like options and are not

- **`clang-wasm` by `sliftist`** — ⚠️ **a naming trap.** Its own description is "clang-wasm binary. **No affiliation with the clang or LLVM projects.**", and its sub-packages are `clang-linux-x64`, `clang-darwin-x64`, `clang-win64`, `clang-wasm-win64`. It is a Node wrapper that downloads **native x64 binaries**. It cannot run in a WebView or in Hermes. Ignore it.
- **`microbit-clang-wasm@21.11.0-alpha.1`** — a genuine Clang + LLD + LLVM binutils compiled to WASM, but packaged for a BBC micro:bit Cortex-M4 target with Arm's newlib-nano. Clang's frontend and its diagnostics are target-independent, so in principle it could analyze host C/C++ and emit real diagnostics. Interesting as a fallback, but alpha and not shaped for this use. License: "SEE LICENSE IN LICENSES" (LLVM + newlib).
- **`@buddhilive/sandbox-toolchain@0.1.0-beta.5`** — "On-demand native compilation toolchain (Python + Clang WASM) for client-side Node.js sandbox", published 2026-09-13, MIT, 780 monthly downloads. Beta and Node-oriented, but it bundles both a Python and a Clang WASM toolchain and is worth a look if you want a single dependency covering both.
- **`@wasm-fmt/clang-format@23.1.1`** — 76,116 weekly downloads, MIT, well maintained. Formatter only, no diagnostics. Not what you asked for, but a natural companion for the C/C++ story.
- **`binji/wasm-clang`** — the Mozilla-era clang-in-browser experiment from around 2017. I did not verify whether it still exists; treat as abandoned.
- **cppcheck compiled to WASM** — I found **no maintained npm package**. Flagged as a gap I did not close.

---

## 8. Go — no production option

**[Yaegi](https://github.com/traefik/yaegi)** is a real, capable Go interpreter. Upstream health is good: 8,402 stars, 423 forks, Apache-2.0, not archived, 63 subscribers, maintained by Traefik for its embedded scripting engine. It performs real type checking, so it produces genuine Go errors — `undefined: foo`, `cannot use x (variable of type int) as string value in argument to f`.

**But Yaegi has no official WASM distribution.** I searched GitHub for `yaegi` + `wasm` and found only hobby projects:

- [`Muhammad-Ayman/yaegi-wasm`](https://github.com/Muhammad-Ayman/yaegi-wasm) — **2 stars, 1 fork, last push 2025-09-17**, no releases, no npm package
- [`rohanthewiz/go-learn`](https://github.com/rohanthewiz/go-learn) — 0 stars, created 2026-07
- [`wasm-outbound-http-examples/yaegi`](https://github.com/wasm-outbound-http-examples/yaegi) — 0 stars, a demo, last push 2024-01

Upstream's own last push was **2026-02-09**, roughly seven months before this research. Active, but not fast-moving.

**GopherJS and TinyGo are build tools, not in-app runtimes.** GopherJS compiles Go→JS using the real Go toolchain and therefore emits real Go compile errors — but at *your* build time, on your machine, which means shipping a Go toolchain. TinyGo is the same story with a partial Go implementation. Neither can be embedded.

Go-compiled-to-WASM *does* work as a delivery mechanism — [`@astrojs/compiler@4.0.0`](https://www.npmjs.com/package/@astrojs/compiler) has 23,066,703 monthly downloads, and [`@reteps/dockerfmt@0.5.4`](https://www.npmjs.com/package/@reteps/dockerfmt) uses standard `GOOS=js GOARCH=wasm` — but in both cases that is one specific Go program, not a general Go toolchain you can point at user code.

**Verdict: there is no production-grade in-app Go interpreter or compiler today.** Real Go errors require a server-side `go build` / `go vet`, which the no-network constraint excludes.

---

## 9. Rust — no

I searched npm for `rust compiler wasm`. Every result is a tool *written in* Rust and compiled to WASM: `@swc/core` (1.16.2), `@resvg/resvg-wasm` (2.6.2), `@matrix-org/matrix-sdk-crypto-wasm` (18.9.0), `@prisma/prisma-schema-wasm` (8.1.0), `@css-inline/css-inline-wasm` (0.21.2), `@gitlab/query-language-rust` (0.41.0). None of them is a compiler. `napi-wasm@1.1.3` is a Node-API shim.

**There is no `rustc`-in-WASM build.** The historical attempts to port rustc's own build to WebAssembly date to 2013–2015 and none is current or usable.

The alternatives that would give real Rust diagnostics all fail on the same two walls:

- **rust-analyzer** is Rust. A WASM build would be tens of megabytes, would need a filesystem, and — decisively — would need to **execute procedural macros**, which means compiling and running Rust code at type-check time.
- **`syn` / `ra_ap_*`** are libraries, not a type checker, and are not distributed to browsers.

**Verdict: no. Nothing in this ecosystem can produce `error[E0425]: cannot find value 'x' in this scope` inside a mobile app.** Keep the existing tree-sitter Rust grammar and be honest with users that Rust diagnostics are syntax-only. Do not spend time here.

---

## 10. Recommended shortlist

Ordered by value per unit of risk. My honest recommendation is to do **one** of these, not all of them.

### Tier 1 — do this

**1. Prism for Ruby** (`@ruby/prism@1.9.0`)
0.85 MB, first-party CRuby parser, real `syntax error, unexpected ...` text, sub-millisecond, ships a browser example, Apache-adjacent cleanliness (MIT). This is the best risk-adjusted improvement available to you, by a wide margin. It replaces your `tree-sitter-ruby` grammar's error path with real Ruby messages. Start here.

### Tier 2 — worth a spike, gated on one experiment

**2. Pyodide for Python** (`pyodide@314.0.7`)
12.2 MB, MPL-2.0, the only route to genuine `IndentationError` / `NameError` with CPython's exact wording. **But it is also the only option here whose Hermes story I could not verify at all.** Before writing any integration, run a single spike: load `pyodide.asm.wasm` as a bundled Expo asset with an explicit `indexURL`, call `loadPyodide()`, then `compile("def f():\n  return x", "t.py", "exec")` and confirm you get an `IndentationError` with the right line. If that works, Pyodide is a clear win and you also unlock `NameError` for an explicit "Run" action. If it fails, drop to Brython.

**3. clang for C / C++ / Objective-C** (`@live-codes/clang-wasm@0.3.0`)
The only real *type* errors available on-device, and genuinely useful. Two caveats you must design around: it will not fit the per-keystroke budget (debounce to idle, or gate behind an explicit action), and it is a three-day-old 0.3.0 package with two dependents. Treat the pilot as a genuine experiment.

### Tier 3 — only if the corresponding pilot succeeds

**4. Brython for Python**, if Pyodide fails on Hermes. Pure JS, no WASM, BSD-3, fastest option. Messages are CPython-shaped but not identical, and it is a single-maintainer project.

**5. mruby for Ruby**, if you need runtime errors and not just parse errors. 1.08 MB, zero dependencies, own WASI shim. The adoption numbers (88 monthly, 0 dependents) are the concern, not the code.

### Explicitly not recommended

| Option | Why not |
| --- | --- |
| **shellcheck-wasm** | GPL-3.0-or-later. Blocked for a proprietary app pending legal review, regardless of how good the diagnostics are. |
| **php-wasm** | 13–16 MB per PHP version *and* ships the PHP-3.01 license with an advertising clause. Legal review required. Viable technically. |
| **Java — anything** | The only real-`javac` path is commercial CheerpJ; the only open one is 51 MB of AGPL-3.0. Not viable. Keep tree-sitter. |
| **Go — anything** | No official Yaegi WASM build; only 2-star hobby forks. GopherJS and TinyGo are build tools. |
| **Rust — anything** | No `rustc` in WASM exists. Nothing can help. |
| **Pyright** | Node child-process wrapper. Not runnable in a WebView or Hermes, and 200–800 ms even where it does run. |
| **Opal, MicroPython-on-npm, mvdan/sh** | Abandoned or never existed as an in-app artifact. |

### Two things worth deciding before you write any code

1. **Are you chasing "real errors" or "real *type* errors"?** Only clang gives you the latter. Everything else gives parse errors and, if you actually execute user code, runtime errors. Executing user code per keystroke is unsound and unsafe; if you want runtime `NameError`s, put them behind an explicit user action, not the lint pass.
2. **Does `WebAssembly` actually exist in this app's Hermes?** I could not confirm it from any primary source, and every WASM option above depends on the answer. This repo's working `web-tree-sitter` integration is good evidence it does — but confirm it on a physical device before designing around it. If it does not, your only options are Brython (pure JS) and the existing tree-sitter grammars.

---

## Appendix: verification notes

- **Verified from registry/CDN manifests** (exact byte counts): all sizes in the summary table. Sources: `https://registry.npmjs.org/<pkg>` and `https://unpkg.com/<pkg>@<ver>/?meta`.
- **Verified from the GitHub API** (stars, last push, archived, license): `traefik/yaegi`, `ruby/ruby.wasm`, `facebook/hermes` (repo metadata, `API/jsi/jsi` contents, and releases up to v0.13.0).
- **Verified from official docs:** [Pyodide usage](https://pyodide.org/en/stable/usage/index.html), [PyScript user guide](https://docs.pyscript.net/2026.7.3/user-guide/), [React Native Hermes](https://reactnative.dev/docs/hermes), [Hermes README](https://github.com/facebook/hermes/blob/main/README.md).
- **Not verified, and I am not claiming otherwise:** the current CRuby `.wasm` byte size; CheerpJ's pricing/size/terms; `@wp-playground/php-wasm` version and sizes; any option's behaviour on Hermes; whether `binji/wasm-clang` still exists; whether a maintained cppcheck-in-WASM npm package exists. These are flagged inline above as leads, not findings.
- **Judgement calls I made and would defend:** treating static type errors as out of scope (§0.1); treating the Hermes `WebAssembly` question as a blocker rather than an assumption (§0.2); recommending "no" for Java, Go and Rust rather than nominating 51 MB AGPL or 2-star forks; and recommending Prism before Pyodide on the grounds that a 0.85 MB first-party win beats a 12.2 MB unverified one.
