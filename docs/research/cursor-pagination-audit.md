# Cursor pagination audit research

Researched September 15, 2026. This document records primary-source findings and design recommendations. It does not claim that every recommendation is implemented; the implementation audit belongs in a separate section.

## Scope and compatibility

The exact [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) was refreshed for the project's Expo `~57.0.20` / Expo Router `~57.0.19` versions. API routes continue to use standard `Request` query parameters and `Response` objects; pagination does not require a framework change or a web application target. Preserve server-only authorization and private response caching. [Expo API routes](https://docs.expo.dev/router/web/api-routes/)

Distinguish three designs during the audit:

| Design | What it guarantees |
| --- | --- |
| Encoded offset/page | Hides transport details, but by itself does not stop insertions/deletions from shifting results. |
| Keyset continuation | Resumes after a stable, uniquely ordered key; its consistency depends on the source's ordering and mutation rules. |
| Snapshot-bound continuation | Resumes within an immutable snapshot, or rejects continuation if the source no longer matches the snapshot. An internal position is valid only while that snapshot is valid. |

These are design distinctions for this audit, not guarantees inferred from the word “cursor” in a provider API.

## Stash identity and mutation

Stashes form a reflog: `stash@{0}` identifies its newest entry and older entries have larger indices. `stash store` records an existing stash commit in that reflog. A stash entry therefore needs more identity than its commit SHA: an existing object can occur again in the sequence. [Git stash](https://git-scm.com/docs/git-stash)

Reflog entries can be appended, individually deleted, expired, or rewritten; deleting an older entry need not change the current ref. Consequently, anchoring a list only to `refs/stash`'s tip SHA cannot detect every sequence change. Entry numbers describe the current sequence, not permanent IDs. [Git reflog](https://git-scm.com/docs/git-reflog)

A temporary Git 2.55.0 experiment confirmed both problems: storing an earlier stash again produced SHA sequence `A, B, A`; deleting the middle stash produced `A, A` while leaving the tip SHA unchanged. The temporary repository was removed after the experiment. Do not deduplicate stash entries by SHA or find continuation by the first matching SHA.

### Recommended stash continuation

Use a versioned, signed cursor containing:

- A scope derived from authenticated user, project, sandbox/repository identity, normalized search, page size, and ordering.
- A digest of the complete ordered stash snapshot.
- A position within that verified snapshot, or a verified entry identity plus position.
- An expiry retained from the first page, rather than extended on every continuation.

Read and verify the snapshot under the existing workspace coordination. For continuation, reject a digest mismatch with an actionable stale-cursor response and require a fresh first page. This allows internal positional reads without pretending an offset alone is stable. A signed token prevents callers from changing its scope or position; it does not establish freshness by itself. These are application recommendations informed by the reflog mutation semantics above.

The digest must cover the complete relevant sequence, including order, repeated SHAs, and message fields used by search. Hashing only a page, the first entry, or unique SHAs misses changes elsewhere. A digest over Git's canonical full listing avoids coupling to storage layout. If hashing the raw reflog instead, support only explicitly validated storage, reject symlinks/unsupported layouts, bound bytes before allocating, and verify unchanged state around page extraction. Git documents file-based reflog records as old/new object IDs, committer identity/date, and optional message. [Git update-ref logging](https://git-scm.com/docs/git-update-ref#_logging_updates)

A full snapshot hash costs a bounded scan of the reflog for each page unless a durable snapshot is stored separately. This is a deliberate consistency/cost tradeoff. Reject an oversized snapshot explicitly; do not silently hash a truncated prefix. A Git lock only coordinates participating processes: when reading mutable source data in multiple steps, verify it did not change between the digest and extraction.

### Search and index behavior

Continue using literal case-insensitive `--grep-reflog` filtering for the displayed `%gs` message. Apply filtering before page limits. Preserve `%gd`'s actual reflog index for detail and pop operations; a filtered row's ordinal is not its stash slot. `--date` may change reflog selectors to timestamps, so do not add it when parsing numeric selectors. Keep selected-entry detail independent of list cursors/search, and retain index-plus-SHA validation. [Git log](https://git-scm.com/docs/git-log)

Search normalization, page size, and repository scope must match on all continuation requests. Missing cursor begins a new snapshot; invalid or stale cursor must not silently reset to page one. Empty search results still return an empty collection with no continuation. These are proposed API behaviors.

## GitHub REST limitations

GitHub REST pagination is endpoint-specific. The `Link` response header supplies continuation URLs, and endpoints can use page numbers, before/after, or since parameters. Most `per_page` limits are 100. Follow the endpoint's documented form rather than assuming one universal cursor scheme. [GitHub REST pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)

The branch-list API exposes `page` and `per_page`, with no documented collection snapshot parameter. Repository-list APIs likewise expose page-based pagination and sort choices. Therefore a Codaloud cursor containing their page/intra-page position is an adapter over provider pagination; it does not by itself freeze the remote list. This is an inference from the published contracts, which do not promise cross-request snapshot consistency. [GitHub branches](https://docs.github.com/en/rest/branches/branches#list-branches), [GitHub repositories](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)

Commit listing accepts a commit SHA or branch as its starting point. Resolve a branch to a full SHA on the first request and retain it in every continuation, preserving the existing snapshot-bound commit design. This fixes the reachable graph's starting point rather than following a moving branch on each page. [GitHub commits](https://docs.github.com/en/rest/commits/commits#list-commits)

GitHub Search returns at most 1,000 results per search and can return `incomplete_results: true` after time limits. A cursor cannot remove those limits. Do not switch existing local filtering of repository/branch lists to Search merely to rename pagination, and do not equate an exhausted provider search window with exhaustive results. [GitHub Search](https://docs.github.com/en/rest/search/search)

GitHub GraphQL connections offer `endCursor` and `hasNextPage`, passed back with `after`. These are provider cursors, but the documentation does not assert immutable collection snapshots. A GraphQL migration may improve continuation mechanics; it is a separate integration change and should not be treated as a drop-in consistency guarantee. [GitHub GraphQL pagination](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api)

For mutable remote collections requiring stronger consistency, choose explicitly between a bounded stored snapshot, a stable keyset supported by the provider, or documented best-effort provider continuation. Retain per-request authorization in every case. Neither base64 encoding nor HMAC signing makes a mutable provider page stable.

## Existing code worth reusing

Inspection found [commit-pagination.ts](../../src/features/projects/server/commit-pagination.ts) already implements signed, scoped, expiring continuation tied to `snapshotSha`; reuse its established cryptographic pattern rather than introducing unrelated token handling. Its provider scanner lives in [search-pagination.ts](../../src/services/github/server/search-pagination.ts). [repository-cursor.ts](../../src/services/github/server/repository-cursor.ts) currently validates encoded provider page/intra-page positions and query scope; its own comment correctly distinguishes a position from authorization. This research does not replace the root implementation audit of those paths.

## Verification recommendations

Test unchanged snapshot traversal with no omissions or duplicates, repeated stash SHAs, insertion before the next page, deletion before/after the anchor, deletion of older entries with unchanged tip, message rewriting, clear/recreate, filtered sparse matches, empty results, and oversized snapshots. Validate malformed/tampered/expired tokens and cross-user/project/search/page-size reuse. Check that a stale continuation returns a refreshable error and that clients reset the cursor when filters change. For provider adapters, test bounded scans and honest handling of incomplete results separately from the public cursor contract.

## Implemented API audit

All paginated application API contracts now accept `cursor` and return `nextCursor`. The audit covered the routes under `src/app/api`, their request schemas, service adapters, and infinite-query consumers. Only stash listing exposed an offset; other occurrences of `offset` describe internal provider positions, snapshot positions, string parsing, filesystem batches, or date-time offsets.

| API collection | Pagination implementation |
| --- | --- |
| Projects | Database keyset by selected sort value plus unique project ID; no SQL offset. |
| Workspace branches | Ordinal branch-name keyset scoped to project and search. |
| Commit history, local and remote | Signed, scoped cursor with expiry and fixed starting commit SHA; internal bounded Git/GitHub batches. |
| File search | Signed continuation within a stored search snapshot; scope and workspace freshness checks. |
| GitHub repositories and repository branches | Validated opaque cursor over provider page/intra-page positions; provider collections can change between requests. |
| Stashes | Cursor anchored by entry index and SHA within a digest of the complete ordered list; changed snapshots reject continuation. |

The remaining APIs return individual resources, bounded complete results, or mutation results, with no client pagination contract. GitHub REST adapters continue using the provider's documented page parameters internally. This audit does not claim provider snapshot consistency for mutable GitHub repository/branch lists.

### Stash implementation decisions

- The cursor includes version, project/sandbox/repository-and-query scope hash, complete snapshot digest, and the last returned entry's actual index and SHA. A repeated SHA remains a distinct entry. Continuation selects matching entries after that anchor, with no caller-provided offset.
- The scope uses project and sandbox IDs injected by the trusted Daytona adapter, plus the resolved repository path, normalized search and page size. Existing authentication and project ownership checks execute on every request.
- Following the existing branch/project position-cursor convention, stash tokens are validated positions, unsigned and without expiry. They grant no access, contain no credentials, and do not require a new secret or persisted session. A caller can construct another valid position in a list they can already read; authenticity is not used as an authorization or freshness boundary. This intentionally does not adopt the optional signing/expiry recommendation above.
- A single Git listing supplies both snapshot hashing and page extraction under the shared repository lock. It includes all ordered messages and duplicate SHAs. Case-insensitive literal matching is applied in JavaScript to those same entries, avoiding a second mutable Git read. The 4 MiB output limit and command deadline bound the scan; a truncated list is never accepted as a snapshot.
- Omitted cursor starts a fresh list. `nextCursor: null` marks exhaustion. Changed snapshots return `409 GIT_STASH_CHANGED`; malformed positions or changed scope return `400 INVALID_STASH_CURSOR`. Invalid input encoding and legacy `offset`/`page` parameters are rejected by the route. Detail queries retain `index` plus `stashSha` and cannot also include a cursor.
- Each page recomputes the complete bounded snapshot. This trades repeated metadata scanning for stateless, drift-detecting continuation without stored pagination sessions. It is not an immutable retained snapshot: callers refresh after a stash-list change.

Tests exercise real Git traversal, repeated SHAs, filtered indices, repeatable continuation, insertion/removal/clear, unchanged-tip deletion, malformed/altered positions and cross-project/sandbox/query/page-size reuse. API tests cover transport forwarding, legacy parameter rejection and error status mapping. Existing pagination suites verify the other cursor contracts.
