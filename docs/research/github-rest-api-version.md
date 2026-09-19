# GitHub REST API version migration

Researched September 19, 2026. Scope: the Octokit warning for `POST /user/repos`, repository and branch reads, publishing, and the connected-account profile request.

## Finding and recommendation

Pin Codaloud's GitHub REST requests to the supported production version `2026-03-10`. GitHub still supports `POST /user/repos`; the warning's March 10, 2028 retirement date matches the older `2022-11-28` API version. Unversioned requests currently select that older version. This is an API-version migration, so publishing can retain its endpoint and request body. [GitHub API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions), [create a repository](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-for-the-authenticated-user)

GitHub explicitly recommends the `X-GitHub-Api-Version` header. The supported-version table lists no scheduled end of support for `2026-03-10`. Pinning avoids both the current warning and an eventual implicit behavior change when GitHub advances the default. No version is permanently future-proof; review the migration changelog when upgrading again. [GitHub API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions)

Octokit's request implementation formats warnings using the request method and URL when a response has a deprecation header. Its wording alone does not establish that the route itself is being removed. [Octokit request implementation](https://github.com/octokit/request.js/blob/main/src/fetch-wrapper.ts)

## Compatibility review

The published migration removes `has_downloads` and `use_squash_pr_title_as_default` from relevant repository responses and retires old beta-media-type behavior. Codaloud does not consume these fields or request beta responses. A repository-creation rejection caused by trade controls changes from HTTP 422 to 451; error handling must continue treating it as a failure without retrying the creation automatically. No migration entry changes the repository identity, visibility, URL, permission, or branch fields used here. [Version 2026-03-10 breaking changes](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes#version-2026-03-10)

| Application data | Versioned contract reviewed |
| --- | --- |
| Repository `id`, `name`, `full_name`, `description`, `private`, `archived`, `default_branch`, `clone_url`, `html_url`, `permissions` | These remain in the current repository responses. Keep the existing restricted mapper and missing-permission defaults. [Repository endpoints](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10) |
| Branch `name`, `commit.sha`, `protected` | These remain in branch responses. Existing renamed-branch and missing-SHA checks still apply. [Branch endpoints](https://docs.github.com/en/rest/branches/branches?apiVersion=2026-03-10) |
| Connected profile `id`, `login`, `avatar_url` | These remain in `GET /user`; apply the same version header to the direct fetch used during authorization. [Authenticated user](https://docs.github.com/en/rest/users/users?apiVersion=2026-03-10#get-the-authenticated-user) |

The existing numeric-ID lookup, `GET /repositories/{repository_id}`, is outside the generated endpoint documentation/types used by this project. Its absence means the docs alone cannot prove its versioned contract. Verify this existing route with a read-only public-repository request using the new header, and retain the local identity/permission checks. Do not infer its removal from this warning. See the application's [ID lookup](../../src/services/github/server/repositories.ts).

## Implementation approach and verification

The installed `@octokit/core` 7.x documents request lifecycle hooks. Set the version through `octokit.hook.before("request", ...)` in the shared client factory so generated REST methods and direct requests use one policy. Top-level constructor `headers` is not a documented core option and the installed constructor does not propagate it. Keep the version constant in the existing GitHub service constants and use it in the separate profile fetch. No dependency upgrade or GraphQL migration is required for this header. [Octokit core hooks and options](https://github.com/octokit/core.js#hooks), [installed client factory](../../src/services/github/server/repositories.ts), [profile request](../../src/services/github/authorization.ts)

Test the outgoing headers through the real installed Octokit transport, including generated creation/list/branch methods and the direct ID request. Preserve authentication and cancellation, assert successful response mapping, and cover HTTP 451 as an unsuccessful creation. Check the native authorization request separately. Mocked requests validate application wiring; a public read-only smoke check validates the production version and existing ID lookup. Neither check requires creating a live repository.

## Completed verification

Implemented the shared version constant, Octokit request hook, direct profile header, and an explicit repository-creation error message for HTTP 451.

On September 19, 2026, unauthenticated read-only requests to `GET /versions`, `GET /repos/octokit/core.js`, and `GET /repositories/201147574` each returned HTTP 200 and `x-github-api-version-selected: 2026-03-10`, without `deprecation` or `sunset` headers. Both repository routes returned the same ID and name. This verifies the production version and existing ID route; unauthenticated responses do not verify account-specific permissions or private repository access. [Live version endpoint](https://api.github.com/versions), [public repository](https://api.github.com/repos/octokit/core.js), [public ID lookup](https://api.github.com/repositories/201147574)

All 164 GitHub and publish-action tests passed, including real installed Octokit transport with mocked HTTP responses, repository creation for both visibility settings, pagination, branch and ID reads, profile authorization, native cancellation, and HTTP 451 failure handling. No live repository was created; authenticated creation remains covered by request/response integration tests rather than a production write.
