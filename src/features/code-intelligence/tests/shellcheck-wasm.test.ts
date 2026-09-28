import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createShellCheckAnalyzer } from "../parsers/shellcheck-analyzer";
import { createShellCheckSession } from "../parsers/shellcheck-session";
import {
  toShellCheckDiagnostics,
  type ShellCheckLintResult,
} from "../parsers/shellcheck-diagnostics";

// Drives the real ShellCheck wasm through the same session builder and WASI shim
// the app uses, so the Haskell-to-JavaScript binding and the position mapping are
// both covered. The wasm is 16 MB, hence the long timeouts.
const shellcheckWasmBytes = readFileSync(
  fileURLToPath(
    new URL("../parsers/runtimes/shellcheck.wasm", import.meta.url),
  ),
);

const lintOnce = async (script: string) => {
  const session = await createShellCheckSession(shellcheckWasmBytes);
  const raw = await session.lint(script);
  return toShellCheckDiagnostics(
    script,
    JSON.parse(raw) as ShellCheckLintResult[],
  );
};

describe("shellcheck wasm", () => {
  it("reports real shellcheck codes on the right text", async () => {
    const source = "#!/bin/bash\necho $UNQUOTED\nrm -rf /\n";
    const diagnostics = await lintOnce(source);

    const codes = diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("shellcheck:SC2086");
    const unquoted = diagnostics.find(
      (diagnostic) => diagnostic.code === "shellcheck:SC2086",
    )!;
    expect(source.slice(unquoted.from, unquoted.to)).toBe("$UNQUOTED");
    expect(diagnostics.every((diagnostic) => diagnostic.from >= 0)).toBe(true);
  }, 120_000);

  it("reports nothing for a clean script", async () => {
    expect(
      await lintOnce('#!/bin/bash\nset -euo pipefail\necho "hi"\n'),
    ).toEqual([]);
  }, 120_000);

  // ShellCheck's Haskell runtime degrades after a handful of calls that hit a
  // parser error, then traps forever. Reusing one instance for every keystroke
  // is what made the editor intermittently report shell as unavailable, so this
  // walks the sequence that broke a shared instance and requires every analysis
  // to come back ready.
  it("stays ready across repeated analyses that include parser errors", async () => {
    let downloads = 0;
    const analyzer = createShellCheckAnalyzer(async () => {
      downloads++;
      return shellcheckWasmBytes;
    });
    const sequence = [
      "echo start\nif true\n  echo hi\nfi\n",
      "echo 'unterminated\n",
      "if true; then\n  echo hi\n",
      "#!/bin/bash\ncd /tmp\nfiles=$(ls)\necho $files\nrm -rf /\n",
      "if [ $x = 1 ]; then\n  echo yes\nfi\n",
      '#!/bin/bash\nset -euo pipefail\necho "hi"\n',
      'echo "$(ls"\n',
      "for i in 1 2 3; do\n  echo $i\n",
    ];

    const statuses: string[] = [];
    for (const script of sequence) {
      const result = await analyzer.analyze(script);
      statuses.push(result.status);
    }

    expect(statuses).not.toContain("unavailable");
    expect(statuses.every((status) => status === "ready")).toBe(true);
    // The module is downloaded once; only the instance is rebuilt.
    expect(downloads).toBe(1);
  }, 300_000);

  it("still reports the findings from a late analysis in that sequence", async () => {
    const analyzer = createShellCheckAnalyzer(async () => shellcheckWasmBytes);
    const source = "#!/bin/bash\ncd /tmp\nrm -rf /\n";
    // Burn a few sessions on parser errors first, which is what used to poison
    // the shared instance.
    for (const script of ["if true; then\n", "echo 'unterminated\n"]) {
      await analyzer.analyze(script);
    }

    const result = await analyzer.analyze(source);
    expect(result.status).toBe("ready");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "shellcheck:SC2114",
    );
  }, 300_000);
});
