# Repository Onboarding

Inspect only the files needed to build an accurate request path and lifecycle model.

## Target Project First

Locate:

- `AGENTS.md` and repository instructions.
- `go.mod`, `go.sum`, and `replace` directives.
- Entry points such as `_cmd/main.go`, `_cmd/api/main.go`, or `simple/main.go`.
- Environment files under `_bin/` and configuration access under `global/`.
- Domain registration and blank imports.
- Existing Router -> Controller -> Service -> Model/Domainx modules.
- Existing tests, build scripts, deployment files, and documentation.

Trace one complete existing behavior before proposing a new pattern.

## Framework Files by Concern

Read the resolved Gorig version, not an unrelated checkout.

- Startup and lifecycle: `bootstrap/startup.go`, `serv/serv.go`.
- HTTP server and routing: `httpx/serv.go`, `httpx/mid.*.go`.
- Parameters and responses: `apix/params.go`, `apix/handle.go`, `apix/response/response.go`.
- Data access: `domainx/`, `domainx/dx/dx.go`, relevant database adapter, and `test/dx_test.go`.
- Cache: `cache/` and `test/cache_test.go`.
- Scheduled tasks: `cronx/` and `test/cron_test.go`.
- Messaging: `mid/messagex/` and `test/message_test.go`.
- Authentication: `mid/tokenx/`, `httpx/mid.sign.go`, and relevant tests or real consumers.
- Security middleware: `httpx/mid.cors.go`, `httpx/mid.debounce.go`, `httpx/mid.logger.go`, and response helpers for auth/rate-limit errors.
- Outbound HTTP: `httpx/http.go` and any project-specific external API wrappers.
- SSE: `httpx/ssex/` and `test/ssex_test.go`.
- Configuration, errors, and logs: `utils/cofigure/`, `utils/errors/`, `utils/logger/`.

## Reading Strategy

1. Trace imports and `init()` registration from the entry point.
2. Trace one HTTP request from route to response.
3. Confirm parameter and response function signatures.
4. Confirm context, error, and logging conventions.
5. Confirm component startup and shutdown behavior.
6. Confirm the behavior in tests or a real project.
7. Reuse the target project's established architecture unless there is a clear reason to change it.

If the project layout is unfamiliar, discover it with `rg --files` and package imports before asking the user.
