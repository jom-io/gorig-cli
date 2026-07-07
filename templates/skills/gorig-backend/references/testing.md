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

## Test Placement

Prefer the project-level `test/` package for Gorig feature tests because it centralizes configuration, database setup, cache setup, and framework initialization. Add package-local tests only when the target project already follows that convention or the code under test has no Gorig initialization dependency.

## Effect Verification

Match verification to the delivered behavior:

- Business scenario: verify the observable business outcome, not only the framework primitive.
- Project bootstrap: start the binary, request `/ping`, then stop it gracefully.
- HTTP API: exercise success, required-parameter, invalid-parameter, not-found, and service-error responses.
- Database: verify migration/index creation plus read/write/update/delete and pagination.
- Cache: verify miss, hit, expiry, invalidation, and concurrency behavior.
- Cron: verify execution count, timeout, panic recovery, deduplication, and shutdown.
- Messaging: verify publish/consume, ordering, retry, DLQ, unsubscribe, and cross-process behavior when Redis-backed.
- SSE: verify event shape, error event, timeout, disconnect, and cleanup.
- Authentication and security: verify valid, missing, malformed, expired, refreshed, revoked/logout, and forbidden tokens; verify user and trace context, CORS preflight, debounce behavior, exception paths, and secret hygiene.
- Outbound HTTP: verify GET, form, JSON, XML, headers, context/header propagation, timeout, bad responses, malformed payloads, and image fetching against a local server.
- Deployment: verify startup, health, business endpoint, graceful stop, and rollback in a disposable target.

## External Infrastructure

Use disposable containers or explicitly supplied development services for MySQL, MongoDB, and Redis integration checks. Do not silently target shared or production infrastructure.

If required infrastructure is unavailable, keep the capability unverified and report the exact missing check.

## Business Scenario Tests

For ordinary user requests, write tests around the business behavior first, then prove the selected Gorig component supports it.

Examples:

- A "customer follow-up reminder" test should prove a customer without follow-up becomes pending follow-up after the delay, while a customer already followed up is not changed.
- A "send notification after order paid" test should prove the order-paid event triggers exactly the intended subscribers and is safe to retry.
- A "live progress page" test should prove the browser stream receives the expected event and subscriber cleanup happens on disconnect.
- A "speed up customer detail" test should prove cache miss, hit, invalidation after update, and fallback when cache is unavailable.

When the selected solution requires Redis, MySQL, MongoDB, or another external service, split tests into:

- ordinary tests for business decision logic and framework error paths, and
- integration tests for runtime delivery against disposable or explicitly supplied infrastructure.

Do not claim the business feature is verified when only the ordinary tests ran and the required integration service was unavailable.

## Advanced Data Access Tests

For advanced `domainx/dx` work:

- Ordinary compile and unit tests must cover query construction and service validation without external services when possible.
- MySQL and MongoDB behavior must be proven with tagged or container-backed integration tests before it is claimed verified.
- Verify optional filters with empty values and intentional zero values.
- Verify sorting, projection, count, sum, existence checks, pagination, update/delete guards, migrations, and indexes.
- Verify list/page implementations use database-backed filtering, sorting, and pagination. Do not accept tests that pass only because a small fixture was loaded into memory and sliced.
- Verify direct-driver escape hatches and transactions only against the backend where they are used.
- Record backend-specific differences and unsupported operations in delivery notes or module documentation.

## Cache Tests

For cache work:

- Memory, JSON, and SQLite cache behavior should run locally without Redis or database services.
- Verify miss, hit, expiry, delete, invalidation, counter, flush, and persistence when the backend is persistent.
- Verify multi-level cache by testing L1 miss, lower-layer hit backfill, full miss loader, delete across layers, and concurrent same-key loading.
- Redis behavior must run only with disposable or explicitly supplied Redis configuration.
- State whether cache is an acceleration layer or a source of state. Do not use cache as source of truth unless loss, expiry, and cross-process behavior are acceptable and tested.

## Generated Persistent CRUD Tests

For CLI-generated persistent CRUD modules:

- Keep validation tests in `test/<module>_test.go`; ordinary `go test ./...` must not require a database.
- Keep real database tests behind backend-specific build tags in `test/<module>_integration_test.go`.
- Initialize only the selected backend in `test/init_mysql_integration_test.go` or `test/init_mongo_integration_test.go`.
- Synchronize non-secret connection skeletons into `test/_bin/local.yaml`. Gorig tests normally read this file because the package working directory is `test/`.
- Run `go test -tags=integration,mysql ./test/... -v` or `go test -tags=integration,mongo ./test/... -v` after local connection values are available.

Never claim database behavior is verified merely because a tagged integration test compiles.

## Scheduled Task Tests

For `cronx` work:

- Prefer short deterministic schedules such as `@every 1s` in tests; keep the test bounded with channel waits or deadlines.
- Verify duplicate registration with a stable named function and the same spec.
- Verify timeout by asserting the handler observes `ctx.Done()`.
- Verify panic recovery by proving a later task still runs or the wrapper returns without terminating the process.
- Verify delay and once jobs run exactly once.
- Call `cronx.Shutdown("CRON", context.Background())` at the end of the test.
- Verify `AddEveryTask` registration returns promptly and the interval task executes when the target version includes commit `92c28b5` or an equivalent fix.
- For persistent delay tasks, verify handler registration rejects anonymous functions, scheduling rejects unregistered handlers, and non-JSON payloads fail before enqueue.
- Run persistent delay/once runtime tests only with disposable or explicitly supplied Redis. Assert payload delivery, timeout/failure behavior when relevant, task key cleanup, and worker shutdown.

## Messaging Tests

For `messagex` work:

- Use unique topic names per test and always unregister subscribers.
- Verify local publish/consume with typed getters because payload keys are lowercased.
- Verify multiple subscribers each receive the same published message.
- Verify sequential subscribers preserve publish order.
- Verify retry and DLQ behavior with `RegisterTopicSeq`.
- Verify unsubscribe by publishing after unregister and asserting no new delivery occurs.
- Verify local `ReplayDLQ` returns the expected store-not-initialized error; verify replay behavior only with Redis configured.
- Run Redis broker checks only against disposable or explicitly supplied Redis configuration.

## SSE Tests

For SSE work:

- Use `httptest` for header and payload verification.
- Verify GET streams return `Content-Type: text/event-stream`.
- Verify non-GET requests return HTTP 405 and the framework JSON body.
- Verify `SendOK` and `SendError` event shapes.
- For long-lived streams, cancel the request context and assert the handler exits.
- For message-to-SSE composition, verify subscriber cleanup on disconnect.

## Authentication and Security Tests

For auth/security work:

- Build a minimal login -> protected route -> logout flow in tests or smoke routes.
- Use `tokenx.Get(tokenx.Jwt, tokenx.Memory)` for simple local single-process auth tests. Use `tokenx.Get(tokenx.Jwt, tokenx.Redis)` and `httpx.SignRedis()` when the target version includes `mid/tokenx/redis.manager.go` or an equivalent Redis manager implementation and the business needs Redis-backed token state.
- For Gorig `master` and releases containing `test/tokenx_redis_test.go`, run `go test ./test -run TestRedisTokenManager -v` when Redis is configured. If the test skips with `redis is not configured`, report the missing Redis configuration and rerun after Redis is provided; do not downgrade the capability to memory token unless the user accepts that behavior change.
- Verify valid token success and that protected handlers read user id from `apix.GetUserID`, not from request input.
- Verify missing header, malformed `Authorization`, expired JWT through `IsNotExpired`/`IsEffective`, destroyed token, refreshed old token, refreshed new token, and forbidden role/attribute. Also verify protected-route behavior for manager-expired or unrecorded tokens according to the resolved version.
- Verify middleware writes user id into both gin context and request context, and trace context remains available.
- Verify CORS `OPTIONS` response status, origin, credentials, and allowed headers.
- Verify debounce returns HTTP 429 for repeated requests within the window and allows whitelisted paths.
- Scan generated examples and fixtures for real-looking secrets, raw bearer tokens, production hosts, and passwords.

## Outbound HTTP Tests

For outbound client work:

- Use `httptest.Server` or a controlled local server, not a real third-party API.
- Assert query parameters for `Get`/`GetHeader`.
- Assert form body and content type for `PostForm`.
- Assert JSON body and response parsing for `PostJSONResp` or `PostJSON`.
- Assert XML body and parse behavior; wrap `ParseXML` when malformed XML is expected.
- Assert custom headers and intentional `Authorization` forwarding through context-aware helpers.
- Exercise timeout using a slow handler and a bounded client/helper.
- Exercise non-success status and malformed JSON/XML response behavior.
- Exercise `FetchImage` only with a controlled local image response, and document size/content-type/host boundaries when user URLs are accepted.

## Delivery Evidence

Report:

- Exact command.
- Exit status.
- Important output or assertion.
- Environment and dependency version.
- Skipped checks and reason.
- Known limitations discovered during verification.

"Tests passed" without commands and effect evidence is insufficient.
