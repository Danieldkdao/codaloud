import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeFormatFile } from "../format-analyzer";

const treeSitterAnalyzerMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("../parsers/grammar-loader", () => ({
  createTreeSitterLanguageAnalyzer: (grammarId: string) =>
    treeSitterAnalyzerMock.create(grammarId),
}));

const formatParser = {
  analyze: vi.fn(),
  dispose: vi.fn(),
};

beforeEach(() => {
  formatParser.analyze.mockImplementation(async (content: string) => {
    const broken =
      content.startsWith("NOT_A_DIRECTIVE") || content.includes("'open");
    return {
      status: "ready",
      diagnostics: broken
        ? [
            {
              from: 0,
              to: 1,
              severity: "error",
              message: "Unexpected syntax",
              source: content.startsWith("NOT_A_DIRECTIVE")
                ? "Tree-sitter: Dockerfile"
                : "Tree-sitter: Shell",
              code: "tree-sitter:syntax-error",
            },
          ]
        : [],
    };
  });
  treeSitterAnalyzerMock.create.mockReturnValue(formatParser);
});

describe("analyzeFormatFile", () => {
  it.each([
    ["settings.json", '{"enabled": true}'],
    ["settings.jsonc", '{\n  // local setting\n  "enabled": true,\n}'],
    ["settings.json5", "{ enabled: 'yes', }"],
    ["settings.yaml", "enabled: true\nitems:\n  - one"],
    ["settings.toml", "[app]\nenabled = true"],
    ["settings.xml", '<app enabled="true" />'],
    ["settings.ini", "[app]\nenabled=true"],
    [".env", "APP_MODE=local\n"],
    ["Dockerfile", "FROM node:22\nWORKDIR /app\n"],
    ["script.sh", 'if [ -n "$HOME" ]; then\n  echo ok\nfi'],
    ["README.md", "---\ntitle: Notes\n---\n# Notes"],
    ["README.md", "# Notes\n"],
  ] as const)("accepts valid %s syntax", async (path, content) => {
    await expect(analyzeFormatFile(path, content)).resolves.toEqual({
      status: "ready",
      diagnostics: [],
    });
  });

  it.each([
    ["settings.json", '{"enabled": true,}', "JSON parser"],
    [
      "settings.jsonc",
      '{\n  "enabled": true\n  "other": false\n}',
      "JSONC parser",
    ],
    ["settings.json5", "{ enabled: 'unterminated }", "JSON5 parser"],
    ["settings.yaml", "enabled: [one, two\n", "YAML parser"],
    ["settings.toml", "enabled = [1, 2\n", "TOML parser"],
    ["settings.xml", "<app>\n  <value>open\n</app>", "XML parser"],
    ["settings.ini", "[app\nenabled=true", "INI parser"],
    [".env", "APP-MODE=local\n", "Environment file parser"],
    ["Dockerfile", "NOT_A_DIRECTIVE image\n", "Tree-sitter: Dockerfile"],
    ["script.sh", "if true; then\n  echo 'open\nfi", "Tree-sitter: Shell"],
    ["README.md", "---\ntitle: [broken\n---\n", "YAML parser"],
    ["README.md", "---\ntitle: Notes\n", "Markdown front matter parser"],
  ] as const)(
    "reports a bounded finding for malformed %s syntax",
    async (path, content, source) => {
      const result = await analyzeFormatFile(path, content);

      expect(result.status).toBe("ready");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "error",
        source,
      });
      expect(result.diagnostics[0].from).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics[0].to).toBeGreaterThanOrEqual(
        result.diagnostics[0].from,
      );
      expect(result.diagnostics[0].to).toBeLessThanOrEqual(content.length);
    },
  );

  it("does not flag comment markers or shell-like values inside quoted text", async () => {
    await expect(
      analyzeFormatFile("settings.jsonc", '{"text": "// not a comment"}'),
    ).resolves.toMatchObject({ status: "ready", diagnostics: [] });
    await expect(
      analyzeFormatFile("settings.yaml", 'text: "[not a collection"\n'),
    ).resolves.toMatchObject({ status: "ready", diagnostics: [] });
    await expect(
      analyzeFormatFile("script.sh", "echo 'if open'\necho \\\"fi\\\""),
    ).resolves.toMatchObject({ status: "ready", diagnostics: [] });
  });

  it("keeps parser error offsets after Unicode and CRLF", async () => {
    const content = '{"emoji": "🧪",}';
    const result = await analyzeFormatFile("settings.json", content);

    expect(result.diagnostics[0]?.from).toBeGreaterThan(content.indexOf("🧪"));
    expect(result.diagnostics[0]?.to).toBeLessThanOrEqual(content.length);
  });

  it.each([
    ["settings.json", '{"label":"😀",}'],
    ["settings.jsonc", '{\n  "label": "😀"\n  "other": true\n}'],
    ["settings.json5", "{ label: '😀', value: }"],
    ["settings.yaml", "label: 😀\nitems: [one, two\n"],
    ["settings.toml", 'label = "😀"\nitems = [1, 2\n'],
    ["settings.xml", "<root>😀</wrong>"],
    ["settings.ini", "label=😀\r\n[broken\r\n"],
    [".env", "LABEL=😀\r\nBAD-KEY=x\r\n"],
    ["README.md", "---\nlabel: 😀\nitems: [one, two\n---\n"],
  ] as const)(
    "keeps the %s finding in UTF-16 after a surrogate pair",
    async (path, content) => {
      const result = await analyzeFormatFile(path, content);
      const diagnostic = result.diagnostics[0];
      const emojiOffset = content.indexOf("😀");

      expect(result.status).toBe("ready");
      expect(diagnostic).toBeDefined();
      expect(diagnostic!.from).toBeGreaterThan(emojiOffset + 1);
      expect(diagnostic!.to).toBeLessThanOrEqual(content.length);
      if (diagnostic!.from > 0 && diagnostic!.from < content.length) {
        expect(content[diagnostic!.from - 1]).not.toMatch(/[\uD800-\uDBFF]/);
        expect(content[diagnostic!.from]).not.toMatch(/[\uDC00-\uDFFF]/);
      }
    },
  );

  it("keeps INI and environment findings on the exact CRLF line", async () => {
    const iniContent = "valid=true\r\n[broken\r\n";
    const envContent = "VALID=true\r\nBAD-KEY=value\r\n";
    const [iniResult, envResult] = await Promise.all([
      analyzeFormatFile("settings.ini", iniContent),
      analyzeFormatFile(".env", envContent),
    ]);

    expect(iniResult.diagnostics[0]?.from).toBe(iniContent.indexOf("[broken"));
    expect(envResult.diagnostics[0]?.from).toBe(envContent.indexOf("BAD-KEY"));
  });

  it("accepts multiline quoted dotenv values without executing expansion", async () => {
    await expect(
      analyzeFormatFile(".env", 'MESSAGE="first line\nsecond $VALUE line"\n'),
    ).resolves.toMatchObject({ status: "ready", diagnostics: [] });
  });

  it("fails closed for oversized format input", async () => {
    await expect(
      analyzeFormatFile("settings.json", " ".repeat(1024 * 1024 + 1)),
    ).resolves.toEqual({ status: "unavailable", diagnostics: [] });
  });
});
