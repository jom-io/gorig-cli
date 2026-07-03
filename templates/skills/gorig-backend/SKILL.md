---
name: gorig-backend
description: Build, extend, review, test, troubleshoot, and deploy Go backend projects based on github.com/jom-io/gorig. Use for Gorig project initialization, environment configuration, Router-Controller-Service-Model modules, apix/httpx/serv/bootstrap usage, MySQL or MongoDB through domainx/dx, cache, cronx, messagex, SSE, token authentication, middleware, observability, deployment, and Gorig ecosystem integration. Resolve the target project's actual Gorig version before selecting APIs.
---

# Gorig Backend

Develop Gorig projects from verified source behavior. Treat static examples as fallbacks, never as stronger evidence than the target project's dependency source.

## Start Every Task

1. Read `references/source-policy.md`.
2. Read `references/onboarding-files.md` and inspect the target repository.
3. Run `scripts/detect-gorig-context.sh [project-root]` when a shell is available.
4. Read `references/capability-matrix.md` before selecting a component.
5. Load only the references required by the request.

If the project has no `go.mod`, treat the task as new-project design. Do not assume the latest Gorig API is compatible with an existing project.

## Route the Request

- New runnable project or project initialization: read `references/project-bootstrap.md`, `references/configuration.md`, `references/service-lifecycle.md`, and `references/testing.md`.
- Environment selection or configuration: read `references/configuration.md`.
- Startup, shutdown, built-in services, or custom services: read `references/service-lifecycle.md`.
- Persistent CRUD modules or MySQL/Mongo-backed business modules: read `references/persistent-crud.md`, `references/framework-api.md`, and `references/testing.md`. Add HTTP routes/controllers only when HTTP is in scope.
- Framework registration, non-CRUD HTTP APIs, data access, cache, cron, messaging, SSE, authentication, logging, or middleware: read `references/framework-api.md`.
- Tests, smoke checks, or delivery validation: read `references/testing.md`.
- Missing local source, upstream comparison, latest behavior, or ecosystem repositories: read `references/source-map.md`.
- API documentation changes: use `assets/api-doc-template.md`.
- Module behavior changes: use `assets/module-readme-template.md`.

Detailed scenario references will be added phase by phase. Until a scenario has a dedicated verified reference, inspect the resolved framework source and its tests before implementation.

## Use the Conversation as a Development Workflow

For a new project or a material architecture, API, persistence, security, or deployment change:

1. Restate the business goal, boundaries, and assumptions.
2. Identify the Gorig and Go versions plus external dependencies.
3. Present the route, data, configuration, file, test, and deployment impact.
4. Wait for explicit confirmation before the first material edit.
5. Implement one runnable vertical slice at a time.
6. Verify the effect of each slice before adding the next component.

For an explicitly requested narrow fix with no material design choice, inspect and implement directly.

## Apply Core Framework Rules

- Start applications with `bootstrap.StartUp()` unless the resolved version requires a different entry point.
- Register custom lifecycle services with `serv.RegisterService`.
- Register HTTP routes with `httpx.RegisterRouter` and the callback type used by the resolved source.
- Add `defer apix.HandlePanic(ctx)` to controllers when consistent with the target project.
- Bind and validate input with the resolved `apix` signatures.
- Return the established response envelope and business error code.
- Keep transport logic in controllers and business logic in services.
- Propagate request context through services, data access, logs, and outbound calls.
- Use `utils/errors` and structured `utils/logger` calls.
- Prefer `domainx/dx` for supported data operations; use direct drivers only when the abstraction lacks the required behavior.
- Register migrations and indexes according to the resolved framework implementation.
- Never advertise `experimental` or `unsupported` capability as production-ready.

## Verify Before Delivery

Use the target repository's commands when documented. Otherwise run the applicable checks from `references/testing.md`.

At minimum:

- Format changed Go code.
- Build the affected packages.
- Run relevant tests, including failure paths.
- Exercise the delivered behavior with a local smoke check.
- Report exact commands and results.
- Report skipped checks and concrete blockers.
- Update API or module documentation when behavior changed.

Deliver a concise summary containing changed files, effect verification, compatibility assumptions, known limitations, and safe next steps.
