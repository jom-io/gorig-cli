# Testing and Effect Verification

Prefer repository-specific commands from `AGENTS.md`, CI, or existing scripts. Otherwise use the checks below.

## Standard Go Gates

```sh
go fmt ./...
go vet ./...
go build ./...
go test ./... -v -race -cover
```

Narrow the test command while iterating, then run the full applicable suite before delivery.

Do not force all tests into one directory. Follow the target repository: Gorig projects may use a shared `test/` package, package-local `_test.go` files, or both.

## Effect Verification

Match verification to the delivered behavior:

- Project bootstrap: start the binary, request `/ping`, then stop it gracefully.
- HTTP API: exercise success, required-parameter, invalid-parameter, not-found, and service-error responses.
- Database: verify migration/index creation plus read/write/update/delete and pagination.
- Cache: verify miss, hit, expiry, invalidation, and concurrency behavior.
- Cron: verify execution count, timeout, panic recovery, deduplication, and shutdown.
- Messaging: verify publish/consume, ordering, retry, DLQ, unsubscribe, and cross-process behavior when Redis-backed.
- SSE: verify event shape, error event, timeout, disconnect, and cleanup.
- Authentication: verify valid, missing, malformed, expired, refreshed, revoked, and forbidden tokens.
- Deployment: verify startup, health, business endpoint, graceful stop, and rollback in a disposable target.

## External Infrastructure

Use disposable containers or explicitly supplied development services for MySQL, MongoDB, and Redis integration checks. Do not silently target shared or production infrastructure.

If required infrastructure is unavailable, keep the capability unverified and report the exact missing check.

## Generated Persistent CRUD Tests

For CLI-generated persistent CRUD modules:

- Keep validation tests in `test/<module>_test.go`; ordinary `go test ./...` must not require a database.
- Keep real database tests behind backend-specific build tags in `test/<module>_integration_test.go`.
- Initialize only the selected backend in `test/init_mysql_integration_test.go` or `test/init_mongo_integration_test.go`.
- Synchronize non-secret connection skeletons into `test/_bin/local.yaml`. Gorig tests normally read this file because the package working directory is `test/`.
- Run `go test -tags=integration,mysql ./test/... -v` or `go test -tags=integration,mongo ./test/... -v` after local connection values are available.

Never claim database behavior is verified merely because a tagged integration test compiles.

## Delivery Evidence

Report:

- Exact command.
- Exit status.
- Important output or assertion.
- Environment and dependency version.
- Skipped checks and reason.
- Known limitations discovered during verification.

"Tests passed" without commands and effect evidence is insufficient.
