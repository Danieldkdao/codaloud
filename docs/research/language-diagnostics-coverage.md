# Language diagnostics coverage

This document records the offline editor coverage currently shipped by Codaloud. A parser finding reports syntax only; it does not imply compilation, type checking, dependency resolution, or style lint unless listed below.

## Runnable language modes

| Filename mode | Diagnostic engine                                       | Current coverage boundary                                                                                                                                            |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript    | Bundled TypeScript Language Service                     | Syntax, type, and project-local module diagnostics using the open buffer first and bounded local project reads. Project scripts and compiler plugins are not loaded. |
| JavaScript    | The same TypeScript Language Service in JavaScript mode | Syntax by default. `checkJs` is enabled by a safe parsed project option or `// @ts-check`; ordinary JavaScript does not receive implicit type-check noise.           |
| Python        | Tree-sitter Python 0.25.0 WASM grammar                  | Active-file syntax findings. No Python interpreter, package environment, type checker, or Ruff rules.                                                                |
| Java          | Tree-sitter Java 0.23.5 WASM grammar                    | Active-file syntax findings, including standalone files without a project manifest. No JDK, classpath, external symbol checks, Maven, or Gradle.                     |
| C             | Tree-sitter C 0.24.1 WASM grammar                       | Active-file syntax findings. `.h` uses C. No compiler flags, include paths, system headers, macros, or build checks.                                                 |
| C++           | Tree-sitter C++ 0.23.4 WASM grammar                     | Active-file syntax findings. No compiler flags, include paths, system headers, macros, or build checks.                                                              |
| C#            | Tree-sitter C# 0.23.5 WASM grammar                      | Active-file syntax findings. No .NET SDK, framework references, MSBuild targets, analyzers, or source generators.                                                    |
| Go            | Tree-sitter Go 0.25.0 WASM grammar                      | Active-file syntax findings. No Go toolchain, module downloads, sibling package checks, `go list`, or `go vet`.                                                      |
| PHP           | Tree-sitter PHP 0.24.2 WASM grammar                     | Active-file syntax findings, including PHP tags and mixed template text as supported by the grammar. No Composer autoloading or PHPStan/Psalm rules.                 |
| Rust          | Tree-sitter Rust 0.24.0 WASM grammar                    | Active-file syntax findings. No Cargo dependency fetches, build scripts, procedural macros, crate type checks, or Clippy rules.                                      |
| Ruby          | Tree-sitter Ruby 0.23.1 WASM grammar                    | Active-file syntax findings. No Ruby runtime, Bundler, gem loading, or RuboCop rules.                                                                                |

The parsers for Java, Go, and Rust currently examine the active file only. Their grammars do not establish classpath, module, package, or crate correctness.

## Additional editable formats

| File mode                                      | Diagnostic engine                                | Current coverage boundary                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Markdown and MDX                               | Small front matter check plus YAML 1.2 parsing   | Checks only opening/closing YAML front matter delimiters and front matter syntax. It does not lint Markdown or MDX body content.                             |
| JSON                                           | `jsonc-parser` in strict JSON mode               | JSON syntax only; comments and trailing commas are rejected.                                                                                                 |
| JSONC                                          | `jsonc-parser` with comments and trailing commas | JSONC syntax only.                                                                                                                                           |
| JSON5                                          | `json5` 2.2.3                                    | JSON5 syntax only; error positions are derived from the parser's reported line and column.                                                                   |
| YAML                                           | `yaml` 2.8.1 with YAML 1.2 rules                 | Structural syntax and duplicate-key findings. No remote schema lookup or project-specific validation.                                                        |
| TOML                                           | `@iarna/toml` 3.0.0                              | TOML syntax only. No Cargo, package, or application-specific validation.                                                                                     |
| XML                                            | `fast-xml-parser` 5.5.5 validator                | Well-formedness only. No DTD, schema, network, or entity resolution.                                                                                         |
| INI                                            | Codaloud's passive structural checks             | Checks section headers and simple `key=value` entries. It does not infer interpolation or application-specific value rules.                                  |
| `.env` and `.env.*`                            | Codaloud's passive assignment checks             | Checks assignment names and quote termination. It never expands variables, reads process environment, or loads the file.                                     |
| Dockerfile / Containerfile                     | Tree-sitter Containerfile 0.8.0 WASM grammar     | Syntax findings only. It never invokes Docker, build hooks, image pulls, or commands in the file.                                                            |
| Shell names and `.sh`, `.bash`, `.zsh`, `.ksh` | Tree-sitter Bash 0.25.1 WASM grammar             | Syntax findings using the Bash grammar. Zsh and KornShell extensions may use dialect syntax the Bash grammar does not recognize. Fish files are unsupported. |

JSON, YAML, TOML, XML, INI, environment, Dockerfile, shell, and Markdown findings use the same diagnostics markers, severity counts, and Problems sheet as source-language findings. Each finding names its parser source and stable string code.

## Shared runtime limits

- Diagnostics run offline in the editor's embedded DOM. No project code, configuration script, shell, compiler plugin, build hook, package manager, language server, or remote service is executed.
- The TypeScript analyzer retains its existing dependency-graph and memory bounds. Local parsers reject files above the shared 1 MiB file limit; Tree-sitter parsing also has a 100 ms interactive parse budget.
- Findings are normalized to half-open UTF-16 offsets in the submitted text, deduplicated by source, code, range, and message, and capped at 200. Invalid parser ranges are dropped.
- TypeScript and JavaScript diagnostics keep their compiler source and numeric compiler code encoded as a string. Tree-sitter parser findings use `Tree-sitter: <language>` and `tree-sitter-<grammar>:syntax-error`; format validators identify their parser source.
- Grammar WASM files are loaded through a lazy module and carry the pinned upstream license and attribution in `parsers/grammars/third-party-notices.md`. Total checked-in grammar WASM size is approximately 16.2 MB.
