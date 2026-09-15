import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { formatAgentActivityDate, formatCommitDate, formatCommitTimestamp, formatProjectUpdatedDate } from "../lib/formatters";

beforeEach(() => { vi.stubEnv("TZ", "America/Chicago"); });
afterEach(() => { vi.unstubAllEnvs(); });

it("uses consistent month names and readable local times across project screens", () => {
  const timestamp = "2026-09-14T14:32:00Z";
  expect(formatProjectUpdatedDate(timestamp)).toBe("Updated Sep 14, 2026");
  expect(formatCommitDate(timestamp)).toBe("Sep 14");
  expect(formatCommitTimestamp(timestamp)).toBe("Sep 14, 2026 at 9:32 AM");
  expect(formatAgentActivityDate(timestamp)).toBe("Sep 14 at 9:32 AM");
});

it("converts explicit offsets to the device's local date across a year boundary", () => {
  const timestamp = "2026-01-01T01:30:00+02:00";
  expect(formatProjectUpdatedDate(timestamp)).toBe("Updated Dec 31, 2025");
  expect(formatCommitDate(timestamp)).toBe("Dec 31");
  expect(formatCommitTimestamp(timestamp)).toBe("Dec 31, 2025 at 5:30 PM");
  expect(formatAgentActivityDate(timestamp)).toBe("Dec 31 at 5:30 PM");
});

it("respects daylight saving changes without applying a fixed timezone offset", () => {
  expect(formatCommitTimestamp("2026-03-08T07:59:00Z")).toBe("Mar 8, 2026 at 1:59 AM");
  expect(formatCommitTimestamp("2026-03-08T08:00:00Z")).toBe("Mar 8, 2026 at 3:00 AM");
});

it("formats midnight, noon, and leap days", () => {
  expect(formatCommitTimestamp("2028-02-29T00:00:00-06:00")).toBe("Feb 29, 2028 at 12:00 AM");
  expect(formatAgentActivityDate("2028-02-29T12:00:00-06:00")).toBe("Feb 29 at 12:00 PM");
});

it.each(["", "not-a-date", "2026-02-29T12:00:00Z"])("shows a readable fallback for invalid dates: %j", (timestamp) => {
  expect(formatProjectUpdatedDate(timestamp)).toBe("Update date unavailable");
  expect(formatCommitDate(timestamp)).toBe("Date unavailable");
  expect(formatCommitTimestamp(timestamp)).toBe("Date unavailable");
  expect(formatAgentActivityDate(timestamp)).toBe("Date unavailable");
});
