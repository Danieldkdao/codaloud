import { z } from "zod";
import { isIP } from "node:net";
import { firecrawl } from "./server";

const publicPage = (value: string) => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    isIP(host) ||
    host.includes(":") ||
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost")
  )
    throw new Error("Use a public website URL without credentials.");
  return value;
};
const excerpt = (value: string, limit: number) =>
  value
    .replace(/[\t ]+/g, " ")
    .trim()
    .slice(0, limit);
export const searchWeb = async (query: string) => {
  const result = await firecrawl.search(
    z.string().trim().min(1).max(300).parse(query),
    { limit: 3, sources: ["web"], timeout: 20000 },
  );
  return (result.web ?? []).slice(0, 3).flatMap((item) => {
    if (!("url" in item) || !item.url) return [];
    return [
      {
        url: publicPage(item.url),
        title: excerpt(item.title ?? "Page", 160),
        excerpt: excerpt(item.description ?? "", 800),
      },
    ];
  });
};
export const scrapePage = async (input: string) => {
  const url = publicPage(z.string().max(2048).parse(input));
  const result = await firecrawl.scrape(url, {
    formats: ["markdown"],
    onlyMainContent: true,
    timeout: 20000,
  });
  const text = result.markdown?.trim();
  if (!text) throw new Error("No readable page content was returned.");
  return {
    url,
    title: excerpt(result.metadata?.title ?? "Page", 160),
    text: excerpt(text, 6000),
    truncated: text.length > 6000,
  };
};
