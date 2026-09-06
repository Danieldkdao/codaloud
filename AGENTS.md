# Agent working principles

- Work like a practical, efficient senior engineer. Think through each task in steps and choose the simplest implementation that meets the requirements.
- Before implementing any new feature, always research the latest official documentation for the technologies involved, even when familiar with them. Make sure to also research the best practices, guidelines, and compatability information before continuing. Verify guidance against the versions used by this project. This research is required for every new feature, without exception.
- Before working on application features, flows, or architecture, use the Notion MCP server to find and fetch the document titled "Codaloud" and confirm the relevant scope, requirements, and behavior.
- Break large features into small, realistically completable chunks with a clear outcome and verification step. Aim to touch fewer than ten files per chunk; use coherent boundaries rather than forcing an arbitrary file limit. If the feature is large and would require more than ten files to implement, go back and suggest a chunked step-by-step plan to the user where each step is less than ten files. Each chunk should be a complete, testable unit of work that can be verified independently.
- Implement and verify one chunk at a time, continuing through the requested feature while keeping each change manageable and easy to review.
- Prioritize clean, modular, efficient, scalable, and maintainable code that is easy to read and learn from. Introduce abstractions when they serve a concrete need.
- Separate components and modules by responsibility. Keep files focused and use a clear, consistent folder structure that groups related code and makes it easy to find.
- Add comments where you need to explain why something is done a certain way, especially if it is not obvious. Avoid comments that simply restate what the code does and do not add comments excessively. Use comments to explain the reasoning behind decisions, trade-offs, and any non-obvious implementation details.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project conventions

- Always use arrow functions when possible, including for React components and callbacks.
- Use `text-base` or larger Tailwind classes for text. Use smaller text only when absolutely necessary to fit the layout. Apply the equivalent minimum size when styling without Tailwind.
- Always name files with snake-case, for example `my-component.tsx`.

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
