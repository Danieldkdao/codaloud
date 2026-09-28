# Agent working principles

## Supported platforms

- Codaloud is exclusively an iOS and Android app. Web is not a current or future target; implement and verify application behavior for these two native platforms only. Do not add web-specific components, browser fallbacks, or web app setup.
- Keep infrastructure required by the mobile app: Expo API routes and their server export configuration, OAuth browser sessions, and the CodeMirror editor embedded through Expo DOM/WebView, including its dependencies.

## Native AbortSignal compatibility

- In native app code and shared code reachable from it, use `new AbortController()`, `controller.abort()`, `signal.aborted`, and abort event listeners. Never use `signal.throwIfAborted()`, `AbortSignal.timeout()`, or `AbortSignal.any()` there; do not rely on `AbortSignal.abort()`, `signal.reason`, or custom abort reasons either. TypeScript DOM types and IDE autocomplete do not prove that the installed Expo/React Native runtime implements these APIs.
- Check cancellation explicitly with `if (signal.aborted)` and handle or throw an appropriate error. Implement timeouts with `setTimeout(() => controller.abort(), milliseconds)` and clear the timer in `finally`. When forwarding cancellation, handle an already-aborted signal and remove listeners during cleanup. Reuse existing compatible helpers where available.
- Verify other Web API methods against the installed native implementation before using them. Test cancellation paths with React Native's actual AbortController implementation, not only Node or happy-dom globals, which can hide unsupported methods. These restrictions apply to native execution; server-only Expo API routes, Trigger.dev tasks, and Node workers may use APIs supported by their server runtime.

## Required filenames — check before creating files and before finishing

- Use lowercase kebab-case for every authored filename, including components, hooks, utilities, tests, scripts, and documentation. Separate words with hyphens: `project-filters.tsx`, `use-projects-filters.ts`, and `project-filters.test.tsx`.
- Keep React component and type names in PascalCase inside the file. A component named `ProjectFilters` belongs in `project-filters.tsx`. Treat component-style names in requests, including `ProjectFilters.tsx`, as referring to the component and normalize the filename to kebab-case under this project convention.
- Before creating or renaming a file, check its proposed path against this rule. Preserve platform and test suffixes, such as `native-select.ios.tsx` and `project-filters.test.tsx`.
- Preserve filenames required by tools or frameworks, such as `AGENTS.md`, `CLAUDE.md`, Expo Router's `_layout.tsx`, and route parameter syntax. Preserve tool-generated filenames. These exceptions do not apply to ordinary component files.
- Before reporting completion, inspect every added or renamed file, including untracked files. Correct any filename that violates this rule, update imports and references, and verify that no stale paths remain. Filename verification is part of completing every file-changing task.

## Commit messages

- Every commit subject must use only `type: description`. Choose a lowercase prefix such as `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `build`, `ci`, `perf`, or `chore`. Never add a scope or specifier to the prefix.
- Never use parentheses anywhere in a commit message, including its subject and body. Check the entire message before committing.
- Prefer lowercase descriptions. Capitals are allowed when useful for proper names, acronyms, or case-sensitive code identifiers.

## Working process

- Work like a practical, efficient senior engineer. Think through each task in steps and choose the simplest implementation that meets the requirements.
- Before implementing any new feature, always research the latest official documentation for the technologies involved, even when familiar with them. Make sure to also research the best practices, guidelines, and compatability information before continuing. Verify guidance against the versions used by this project. This research is required for every new feature, without exception.
- If you are going to implement tests to test the feature you are going to build, implement the tests first, before implementing the feature itself. Then test and continue from there.
- Never write or run dedicated tests for schema files, including database table definitions. Verify schema changes through code review and TypeScript typechecking instead.
- Before working on application features, flows, or architecture, use the Notion MCP server to find and fetch the document titled "Codaloud" and confirm the relevant scope, requirements, and behavior.
- Break large features into small, realistically completable chunks with a clear outcome and verification step. Aim to touch fewer than ten files per chunk; use coherent boundaries rather than forcing an arbitrary file limit. If the feature is large and would require more than ten files to implement, go back and suggest a chunked step-by-step plan to the user where each step is less than ten files, UNLESS THEY SPECFIED OTHERWISE. Each chunk should be a complete, testable unit of work that can be verified independently.
- Implement and verify one chunk at a time, continuing through the requested feature while keeping each change manageable and easy to review.
- Prioritize clean, modular, efficient, scalable, and maintainable code that is easy to read and learn from. Introduce abstractions when they serve a concrete need.
- Separate components and modules by responsibility. Keep files focused and use a clear, consistent folder structure that groups related code and makes it easy to find.
- Add comments where you need to explain why something is done a certain way, especially if it is not obvious. Avoid comments that simply restate what the code does and do not add comments excessively. Use comments to explain the reasoning behind decisions, trade-offs, and any non-obvious implementation details.
- If you have ran the application to test it, make sure to stop the application before returning your response. Do not leave the application running in the background while you are responding. Note that this only applies if YOU ran the application to test it, if the user ran it and you just used that instance, you do not need to stop it.
- Before creating a helper or implementing reusable logic, search the codebase with `rg` for equivalent behavior, not just the proposed function name. Inspect relevant helper, utility, formatter, hook, and service files in shared folders and feature folders, plus their callers, to find implementations that already solve the same problem. Reuse or extend a suitable implementation before adding another. Create new logic only after this search finds no suitable implementation; keep feature-specific helpers in their feature folder and genuinely shared helpers in the appropriate shared folder.
- For table enums, export them from a `shared.ts` file in the root of the `db` folder. For each enum, you should export three things.
1. An array of all the enum values, for example `export const projectStatuses = ['draft', 'published', 'archived'] as const;`
2. A type that represents the enum values, for example `export type ProjectStatus = (typeof ProjectStatusValues)[number];`
3. The enum itself using PgEnum, for example `export const projectStatusEnum = pgEnum('project_statuses', projectStatuses);`
Note the naming conventions for each.
- Generally, put all types in the `lib/types.ts` file, unless they are specific to a feature or resource, in which case they should be defined in that feature's folder or belong to a certain component. For example, types related to projects should be defined in `features/projects/types.ts`. On the other hand, types related to components like prop types and types related to those should live in the same file as the component. Similarly, put all shared constants in the `lib/constants.ts` file, unless they are specific to a feature or resource, in which case they should be defined in that feature's folder. Same component rule for constants and functions as the types. For example, constants related to projects should be defined in `features/projects/constants.ts`. Do not create your own files in the lib folder that have both types, constants, and functions related to some resource or functionality because that gets messy and hard to maintain. Keep the lib folder for shared types, constants, and functions that are used across the application.
- For all tables, make sure to export all relations defined along with two types. A select type and an insert type. For example, for the `projects` table, you should export `ProjectSelectData` and `ProjectInsertData` from the `ProjectTable.$inferSelect` and `ProjectTable.$inferInsert` respectively.
- Export each Zod schema's inferred type from the same file, using the schema variable's name in PascalCase with the `Schema` suffix. For example, `createProjectSchema` exports `type CreateProjectSchema = z.infer<typeof createProjectSchema>`.
- For every Zod enum, define and export its values as a named `as const` array, export a union type derived with `(typeof values)[number]`, and pass the array to `z.enum()`. Reuse existing arrays when available so schemas and UI options share one source of truth.
- Read actions return the requested data on success, including empty collections, and `null` on validation, request, or response failure. Catch errors and return `null`; keep error response objects in API routes.
- Keep each `useQuery` or `useInfiniteQuery` hook and all of its TanStack Query configuration and logic in the same hook file, with options defined directly inside the hook. This includes query keys, query functions, search normalization, pagination, and enabled conditions. Never separate query options into another file or a `queries/` folder. Shared helpers and resource-specific request functions may be imported when useful.
- After making changes to the codebase, use the `review-change-flows` skill and follow its instructions to give the user a flow-based review guide that groups all changed files and provides a recommended reading order.


## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project conventions

- Read environment variables through the typed T3 Env Core exports: `serverEnv` from `@/data/env/server` in server-only code and `clientEnv` from `@/data/env/client` in client code. Add new variables to the corresponding env schema before using them. Keep direct `process.env` reads inside those env modules for their runtime mappings; elsewhere, use them only for a specific technical requirement (such as tooling that cannot load the application env module) and document the reason next to the read. Keep server-only env imports out of client code.
- Prefer type aliases for object shapes, props, and contracts. Use interfaces only when an interface-specific capability, such as declaration merging, is required.
- Always use arrow functions when possible, including for React components and callbacks.
- Always compose dynamic or conditional class names with `cn` from `@/lib/utils`, for example `cn("text-base", selected && "font-semibold", className)`, rather than template literals, string concatenation, or array joins. Static class strings can remain literals. Bypass `cn` only for a specific technical incompatibility, explained in an adjacent comment. Keep complete Tailwind utility names statically discoverable; select whole class strings instead of interpolating fragments such as `bg-${color}`.
- Always format values through named formatter functions; never use object lookup maps for labels, styles, or other presentation formatting. Use an exhaustive `switch` for enum values. A formatter may return an object of related presentation fields, such as `{ label, className, textClassName }`. Keep resource-specific formatters in that feature's `lib/formatters.ts` and call them from components.
- Use `text-base` or larger Tailwind classes for text. Use smaller text only when absolutely necessary to fit the layout. Apply the equivalent minimum size when styling without Tailwind.
- Never use `leading-*` or `tracking-*` class names anywhere in the codebase, including variant-prefixed and arbitrary-value forms. Keep the default line height and letter spacing provided by the typography styles.
- Use semantic colors from the theme in `src/global.css` for all UI colors, including icons and inline styles (for example, `text-foreground`, `text-muted-foreground`, and `bg-primary`). Never use Tailwind palette colors, arbitrary color utilities, or hardcoded color values in application components unless an external requirement makes it unavoidable; document the reason for that exception. Define color values centrally in the theme.
- Name variables holding database query or mutation results after the operation or lookup purpose and the resource: `insertedProject`, `updatedProject`, `deletedProject`, or `existingProject` for an existence lookup. Apply this convention to results from database helper functions too, and use plural resource names for collections, such as `insertedProjects`.
- Always name database tables with PascalCase and end with `Table`, for example `ProjectTable` The file name for this would be `project.ts` (singular version of the table subject) and the name of the table in the database would be `projects` (plural version of the table subject).
- When you use comments in the code, make sure to keep them short and concise. No more than 2 lines per comment because then it just gets hard for me to read them. Do not try to stuff all the content on one line, that is equally as bad. Keep comments to the point and make sure they are easy to read and understand. Also do not stack the commments on top of each other just to add more content. Keep things simple and clear.

## Folder structure

Organize application code under `src/`:

- `app/`: Expo Router screens, routes, and layouts.
- `lib/`: Shared types, constants, helpers, utilities, authentication setup, and other global code.
- `features/`: Resource-specific code, organized by resource, such as `projects/` and `drafts/`. Keep each resource's mutations, actions, fetch functions, and related logic together here.
- `db/`: Database setup, schema, migrations, and other database infrastructure.
- `data/env/`: Type-safe environment variables using T3 Env Core (`@t3-oss/env-core`), with server variables in `server.ts` and client variables in `client.ts`.
- `components/`: Shared components used across the application. Put base UI primitives such as buttons and cards in `components/ui/`; put other generic components, such as a link button, directly in `components/`.
- `hooks/`: Shared hooks used across resources. Keep resource-specific hooks within their corresponding feature.
- `services/`: Third-party integrations, organized by service, such as Trigger.dev, Daytona, or the Vercel AI SDK. For example, the AI integration could live in `services/ai/`.

Keep resource-specific code in its feature folder; use shared folders for code with application-wide responsibilities or reuse across resources.

When creating test files, place feature tests in `src/features/<feature>/tests/` and service tests in `src/services/<service>/tests/` (for example, `src/features/projects/tests/` and `src/services/github/tests/`). Keep tests for shared infrastructure, such as Query Client, in the root `tests/` folder. Use `.test.ts` or `.test.tsx` filenames.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-tasks`, `trigger-cost-savings`, `trigger-getting-started`.
<!-- TRIGGER.DEV SKILLS END -->
