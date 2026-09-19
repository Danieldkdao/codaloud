export const GITHUB_SEARCH_BATCH_SIZE = 100;
// Bound work for sparse searches; the client can continue even after an empty page.
export const GITHUB_SEARCH_MAX_BATCHES = 5;
export const GITHUB_CURSOR_MAX_LENGTH = 2048;

// Pin the supported REST contract; unversioned requests use the retiring 2022 API.
// Review https://docs.github.com/en/rest/about-the-rest-api/breaking-changes before upgrading.
export const GITHUB_API_VERSION = "2026-03-10";
