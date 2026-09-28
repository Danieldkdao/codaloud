import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ search: vi.fn(), scrape: vi.fn() }));
vi.mock("../server", () => ({ firecrawl: mocks }));
import { searchWeb, scrapePage } from "../tools";
it("bounds search results and preserves citation URLs without scraping every result", async () => {
  mocks.search.mockResolvedValue({
    web: Array.from({ length: 10 }, () => ({
      url: "https://example.com",
      title: "Title",
      description: "x".repeat(3000),
    })),
  });
  const result = await searchWeb("docs");
  expect(result).toHaveLength(3);
  expect(result[0].excerpt.length).toBeLessThanOrEqual(800);
  expect(result[0].url).toBe("https://example.com");
  expect(mocks.search).toHaveBeenCalledWith(
    "docs",
    expect.objectContaining({ limit: 3, sources: ["web"] }),
  );
  expect(mocks.scrape).not.toHaveBeenCalled();
});
it("bounds scraped text and rejects non-public URLs before calling Firecrawl", async () => {
  mocks.scrape.mockResolvedValue({
    markdown: "a".repeat(12000),
    metadata: { title: "Example" },
  });
  expect(await scrapePage("https://example.com/page")).toMatchObject({
    truncated: true,
    text: "a".repeat(6000),
  });
  mocks.scrape.mockClear();
  for (const url of [
    "file:///etc/passwd",
    "http://127.0.0.1",
    "http://169.254.169.254/latest",
    "http://localhost",
    "https://user:pass@example.com",
  ])
    await expect(scrapePage(url)).rejects.toThrow();
  expect(mocks.scrape).not.toHaveBeenCalled();
});
