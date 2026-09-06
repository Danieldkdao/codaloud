# Agent working principles

- Work like a practical, efficient senior engineer. Think through each task in steps and choose the simplest implementation that meets the requirements.
- Before implementing any new feature, always research the latest official documentation for the technologies involved, even when familiar with them. Make sure to also research the best practices, guidelines, and compatability information before continuing. Verify guidance against the versions used by this project. This research is required for every new feature, without exception.
- If you are going to implement tests to test the feature you are going to build, implement the tests first, before implementing the feature itself. Then test and continue from there.
- Before working on application features, flows, or architecture, use the Notion MCP server to find and fetch the document titled "Codaloud" and confirm the relevant scope, requirements, and behavior.
- Break large features into small, realistically completable chunks with a clear outcome and verification step. Aim to touch fewer than ten files per chunk; use coherent boundaries rather than forcing an arbitrary file limit. If the feature is large and would require more than ten files to implement, go back and suggest a chunked step-by-step plan to the user where each step is less than ten files. Each chunk should be a complete, testable unit of work that can be verified independently.
- Implement and verify one chunk at a time, continuing through the requested feature while keeping each change manageable and easy to review.
- Prioritize clean, modular, efficient, scalable, and maintainable code that is easy to read and learn from. Introduce abstractions when they serve a concrete need.
- Separate components and modules by responsibility. Keep files focused and use a clear, consistent folder structure that groups related code and makes it easy to find.
- Add comments where you need to explain why something is done a certain way, especially if it is not obvious. Avoid comments that simply restate what the code does and do not add comments excessively. Use comments to explain the reasoning behind decisions, trade-offs, and any non-obvious implementation details.
- If you have ran the application to test it, make sure to stop the application before returning your response. Do not leave the application running in the background while you are responding. Note that this only applies if YOU ran the application to test it, if the user ran it and you just used that instance, you do not need to stop it.
- Before you create a new helper or implement some reusable logic, check if it already exists in the codebase. If it does, reuse it instead of creating a new one. If it doesn't exist, create a new helper or utility function and place it in the appropriate shared folder.
- For table enums, export them from a `shared.ts` file in the root of the `db` folder. For each enum, you should export three things.
1. An array of all the enum values, for example `export const projectStatuses = ['draft', 'published', 'archived'] as const;`
2. A type that represents the enum values, for example `export type ProjectStatus = (typeof ProjectStatusValues)[number];`
3. The enum itself using PgEnum, for example `export const projectStatusEnum = pgEnum('project_statuses', projectStatuses);`
Note the naming conventions for each.
- Generally, put all types in the `lib/types.ts` file, unless they are specific to a feature or resource, in which case they should be defined in that feature's folder or belong to a certain component. For example, types related to projects should be defined in `features/projects/types.ts`. On the other hand, types related to components like prop types and types related to those should live in the same file as the component. Similarly, put all shared constants in the `lib/constants.ts` file, unless they are specific to a feature or resource, in which case they should be defined in that feature's folder. Same component rule for constants and functions as the types. For example, constants related to projects should be defined in `features/projects/constants.ts`. Do not create your own files in the lib folder that have both types, constants, and functions related to some resource or functionality because that gets messy and hard to maintain. Keep the lib folder for shared types, constants, and functions that are used across the application.
- For all tables, make sure to export all relations defined along with two types. A select type and an insert type. For example, for the `projects` table, you should export `ProjectSelectData` and `ProjectInsertData` from the `ProjectTable.$inferSelect` and `ProjectTable.$inferInsert` respectively.
- Export each Zod schema's inferred type from the same file, using the schema variable's name in PascalCase with the `Schema` suffix. For example, `createProjectSchema` exports `type CreateProjectSchema = z.infer<typeof createProjectSchema>`.
- Once you have finished implementing a feature or making some changes to the codebase, always give the user a clear summary of all files that you created/updated/deleted.


## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project conventions

- Always use arrow functions when possible, including for React components and callbacks.
- Use `text-base` or larger Tailwind classes for text. Use smaller text only when absolutely necessary to fit the layout. Apply the equivalent minimum size when styling without Tailwind.
- Never use `leading-*` or `tracking-*` class names anywhere in the codebase, including variant-prefixed and arbitrary-value forms. Keep the default line height and letter spacing provided by the typography styles.
- Use semantic colors from the theme in `src/global.css` for all UI colors, including icons and inline styles (for example, `text-foreground`, `text-muted-foreground`, and `bg-primary`). Never use Tailwind palette colors, arbitrary color utilities, or hardcoded color values in application components unless an external requirement makes it unavoidable; document the reason for that exception. Define color values centrally in the theme.
- Always name files with kebab-case, for example `my-component.tsx`.
- Name variables holding database query or mutation results after the operation or lookup purpose and the resource: `insertedProject`, `updatedProject`, `deletedProject`, or `existingProject` for an existence lookup. Apply this convention to results from database helper functions too, and use plural resource names for collections, such as `insertedProjects`.
- Always name database tables with PascalCase and end with `Table`, for example `ProjectTable` The file name for this would be `project.ts` (singular version of the table subject) and the name of the table in the database would be `projects` (plural version of the table subject).

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
