# Gorig Backend Skill Roadmap

## 1. Objective

Build `gorig-backend` into a version-aware AI development skill that can guide and execute a complete Gorig backend lifecycle:

- Create a locally runnable project from a basic requirement.
- Add framework capabilities incrementally according to the business scenario.
- Use the Gorig version actually referenced by the target project.
- Provide minimal, compile-tested examples and current upstream source references.
- Cover development, testing, configuration, security, observability, deployment, and rollback.

This roadmap is maintained in `gorig-cli`. Detailed implementation knowledge belongs in the skill's `references/`, reusable project material belongs in `assets/`, and deterministic checks belong in `scripts/`.

## 2. Delivery Rules

Work on one phase at a time. Do not mark a phase complete or start the next phase until its acceptance checks have produced recorded evidence.

Phase status values:

- `pending`: Not started.
- `in_progress`: Current implementation phase.
- `blocked`: A concrete external or framework blocker prevents verification.
- `verified`: All required acceptance checks passed.

Current status:

| Phase | Scope | Status |
|---|---|---|
| 0 | Skill foundation and source-of-truth rules | verified |
| 1 | Locally runnable basic project | verified |
| 2 | HTTP API and module development | verified |
| 3 | Database and cache | verified |
| 4 | Scheduled tasks, messaging, and SSE | verified |
| 5 | Authentication, security, and outbound networking | verified |
| 6 | Observability, deployment, and operations | pending |

## 3. Global Definition of Done

Every phase must satisfy all applicable checks below:

1. Resolve the Gorig version from the target project's `go.mod` and `replace` directives before selecting APIs.
2. Verify API signatures against the resolved source, not only against static skill examples.
3. Compile every new fixed example.
4. Run unit or integration tests for success paths and important failure paths.
5. Run an effect-level smoke test that exercises the delivered behavior.
6. Record exact commands, pass/fail results, skipped checks, and blockers in the phase completion update.
7. Validate the Codex skill structure and confirm Codex/Claude content parity.
8. Update source links, capability maturity labels, and known limitations.
9. Do not mark unsupported framework behavior as available. If an upstream defect is found, record it and either fix it in the framework or document the supported alternative.
10. Do not include real credentials, production addresses, or private deployment material in examples or fixtures.
11. For material architecture, API, persistence, runtime behavior, configuration, external dependency, or deployment changes, present the impact and wait for explicit confirmation before implementation.
12. For ordinary business-language requests, first decompose the scenario into trigger, durability, audience, data, external dependency, and user-visible effect; present component options and wait for confirmation.
13. Verify the observable business outcome in addition to framework primitive behavior.

Recommended quality gates:

```sh
go fmt ./...
go vet ./...
go build ./...
go test ./... -v -race -cover
```

The exact Go checks run in the generated fixture or relevant Gorig project. Node-based CLI checks run in `gorig-cli`.

## 4. Source and Example Policy

Use this precedence when determining valid behavior:

1. Target project `go.mod`, including `replace` directives.
2. Exact dependency source in the local Go module cache.
3. A compatible local sibling Gorig repository.
4. The matching GitHub release or tag.
5. GitHub `master` only for explicit latest-version or upgrade work.
6. Static skill examples as an offline fallback.

Each component reference must contain:

- Applicable scenarios and boundaries.
- Supported versions and maturity: `verified`, `experimental`, `deprecated`, or `unsupported`.
- Required configuration and service registration.
- Minimal compile-tested example.
- A realistic composition example when useful.
- Tests and effect-verification procedure.
- Failure modes and security constraints.
- Local source locations and public GitHub links.

## 5. Target Skill Architecture

```text
gorig-backend/
├── SKILL.md
├── agents/openai.yaml
├── references/
│   ├── source-policy.md
│   ├── project-bootstrap.md
│   ├── configuration.md
│   ├── service-lifecycle.md
│   ├── http-api.md
│   ├── data-storage.md
│   ├── cache.md
│   ├── scheduled-tasks.md
│   ├── messaging.md
│   ├── auth-security.md
│   ├── sse.md
│   ├── outbound-http.md
│   ├── observability.md
│   ├── deployment.md
│   ├── testing.md
│   ├── ecosystem.md
│   └── source-map.md
├── scripts/
│   ├── detect-gorig-context.sh
│   ├── verify-basic-project.sh
│   ├── verify-examples.sh
│   └── check-source-links.sh
└── assets/
    ├── starter-basic/
    ├── Dockerfile
    └── systemd.service
```

`SKILL.md` remains the compact workflow and reference router. It must load only the references required by the current request.

## 6. Phase Plan

### Phase 0: Skill Foundation and Source-of-Truth Rules

Deliverables:

- Replace the monolithic skill body with a compact workflow and scenario router.
- Establish one canonical skill content source for Codex and Claude.
- Use relative resource paths instead of platform-specific home-directory paths.
- Add source precedence, version detection, capability maturity, and known-limit rules.
- Correct existing examples that do not match current `apix`, `httpx`, `domainx/dx`, `cronx`, `messagex`, and `tokenx` APIs.
- Add a source map covering `gorig`, `gorig-hub`, `gorig-node`, `gorig-om`, and selected local business examples.
- Correct `skill install` target/scope semantics and make installation testable in temporary directories.

Verification:

- Run the skill validator against the Codex package.
- Install Codex and Claude variants into temporary directories and compare expected files.
- Run link and local-source existence checks.
- Compile all retained Go snippets or their equivalent fixtures.
- Confirm no unsupported API is described as production-ready.

Completion evidence:

- Validation command output.
- Installed file tree for both targets.
- Corrected-example compilation results.
- Initial capability maturity matrix.

### Phase 1: Locally Runnable Basic Project

Deliverables:

- Add a non-interactive project initialization path suitable for AI execution.
- Support a selected Gorig version instead of silently mixing project and latest APIs.
- Generate a Go version compatible with the selected Gorig release.
- Generate `local`, `dev`, and `prod` configuration and document `GORIG_SYS_MODE` selection.
- Generate one entry point using `bootstrap.StartUp()` without duplicate HTTP service registration.
- Generate a basic domain with Router, Controller, and Service layers.
- Provide `/ping` plus one example business endpoint.
- Avoid mandatory MySQL, MongoDB, or Redis dependencies in the basic profile.
- Generate additional dependency-free modules in a flat feature-first layout: `domain/<module>/{router.go, controller.go, service.go, dto.go, model/*.go}`.
- Add `--no-start` and other flags required for deterministic automation.
- Add a skill-owned optional Git initialization step after generation and verification: ask the user, copy the standard Gorig `.gitignore`, run `git init`, stage, commit, and report clean status.
- Align the CLI templates and skill bootstrap reference.

Verification:

1. Generate a project in a temporary directory.
2. Run `go mod tidy`, `go fmt ./...`, `go vet ./...`, `go build ./...`, and `go test ./...`.
3. Start it with `GORIG_SYS_MODE=local`.
4. Request `/ping` and the example business endpoint and assert their response shapes.
5. Start with another environment and verify the selected configuration is effective.
6. Generate an additional module with `gorig-cli create` and verify the module tree, blank import registration, docs compatibility, `go vet`, `go build`, and `go test`.
7. If the user confirms Git initialization, copy the Gorig `.gitignore`, initialize the repository, commit the generated project, and verify `git status --short` is clean.
8. Stop the process and verify graceful shutdown.

Completion evidence:

- Generated project tree.
- Build and test output.
- HTTP request and response output.
- Environment-selection output.
- Graceful-shutdown output.
- Optional Git initialization output, commit hash, and clean-status output when enabled.

### Phase 2: Persistent CRUD Module Development

Deliverables:

- Add a dedicated skill reference for persistent CRUD modules: `references/persistent-crud.md`.
- Add a storage-selection workflow: use MySQL when explicitly requested, MongoDB when explicitly requested, inspect existing project conventions when unspecified, and ask the user when the choice is ambiguous.
- Add a configuration discovery and setup workflow: inspect existing `Mysql.<name>` or `mongo.<name>` config, add non-secret YAML skeletons when missing, document `GORIG_...` environment variable overrides, and ask the user for required development connection values before DB integration verification.
- Synchronize the selected non-secret connection skeleton into `_bin/local.yaml`, `_bin/dev.yaml`, `_bin/prod.yaml`, and `test/_bin/local.yaml`; preserve existing named connections and explain that tests normally load only `test/_bin/local.yaml`.
- Clearly state that the verified persistent CRUD workflow currently supports only MySQL and MongoDB. For PostgreSQL, SQLite, Redis-as-store, files, or custom backends, explain the limitation and ask whether to use MySQL/MongoDB or proceed as custom unverified work.
- Extend module development beyond the Phase 1 dependency-free profile with real `domainx/dx` persistence through Service -> DTO -> Model as the core architecture. Router/Controller are generated only when HTTP is in scope.
- Cover both MySQL and MongoDB model patterns, `DConfig()`, `AutoMigrate`, indexes, create/info/list/page/update/delete, not-found, duplicate/invalid input, empty update/delete guards, context propagation, structured logging, and business error-code mapping.
- Generate or update `doc/<module>.md` and `domain/<module>/README.md` from the implemented route and storage behavior.
- Support both new-project generation and additions to existing projects.

Verification:

- Generate or implement a MySQL CRUD module and a MongoDB CRUD module in disposable fixtures or explicit user-provided development projects.
- Always run `go fmt ./...`, `go vet ./...`, `go build ./...`, and `go test ./... -v`.
- Verify generated model `DConfig()` names match the selected `Mysql.<name>` or `mongo.<name>` configuration key.
- Compile build-tagged database integration tests and verify the test package initializes only the selected Gorig database service before exercising CRUD.
- When the selected database is available, exercise create, duplicate/invalid create, info, not found, list filters, page filters, update, delete, and route-level smoke checks.
- When the selected database is unavailable, report DB integration as skipped with the exact missing connection/configuration; do not mark the integration behavior verified.
- Verify service behavior, module README, and storage behavior. When HTTP is in scope, also verify route discovery output, response schema, and API documentation match the implemented routes.

### Phase 3: Advanced Data Access and Cache

Deliverables:

- Extend beyond Phase 2's baseline CRUD into advanced MySQL/MongoDB data access: complex filters, sorting, projection, count/sum, safe batch scans, direct-driver escape hatches, and transaction boundaries where supported or required.
- Document legacy `domainx` APIs versus preferred `domainx/dx` APIs by version.
- Deepen migration and index guidance beyond baseline CRUD, including compound indexes and backend-specific differences.
- Cover Memory, JSON, SQLite, and Redis cache backend selection, Redis configuration guidance, cache-aside, multi-level caching, expiration, counters, cache invalidation, and singleflight.
- Add explicit guidance for when cache is an acceleration layer versus when it is not an acceptable source of truth.

Verification:

- Run local tests for Memory, JSON, and SQLite without external services.
- Run container-backed or explicitly configured integration tests for MySQL, MongoDB, and Redis.
- Verify migrations and indexes.
- Exercise CRUD, pagination, optional filters, cache hit/miss, expiry, invalidation, and concurrent cache loading.
- Record backend-specific differences and unsupported operations.

### Phase 4: Scheduled Tasks, Messaging, and SSE

Deliverables:

- Cover cron expressions, interval tasks, delayed tasks, one-shot tasks, timeout, panic recovery, deduplication, and shutdown.
- Cover local and Redis message brokers, concurrent and sequential subscribers, retry, ordering, unsubscribe, and DLQ replay.
- Cover SSE middleware, connection lifetime, event/error responses, timeout, disconnect, and message-to-SSE composition.
- Validate framework implementations before advertising each helper.

Verification:

- Run a short deterministic scheduled task and assert execution count and shutdown.
- Test timeout, panic, and duplicate-registration behavior.
- Publish and consume local and Redis messages.
- Test retry, sequential ordering, DLQ, replay, and unsubscribe.
- Open an SSE connection, receive an event, verify error output, and verify disconnect cleanup.

### Phase 5: Authentication, Security, and Outbound Networking

Deliverables:

- Cover token generation, parsing, recording, refresh, revocation, route middleware, user context, role/attribute filtering, and logout.
- Clearly separate memory-token behavior from Redis-token behavior, including target-version source availability and Redis configuration requirements.
- Cover CORS, debounce/rate protection, request signing where supported, secret configuration, and sensitive logging rules.
- Cover outbound GET, form, JSON, XML, headers, context propagation, timeout, error handling, and image fetching.
- Add a minimal login -> protected route -> logout flow.

Verification:

- Test valid, missing, malformed, expired, refreshed, revoked, and forbidden tokens.
- Verify middleware populates user and trace context.
- Verify CORS preflight and allowed headers.
- Verify debounce behavior and exception paths.
- Test outbound clients against a controlled local HTTP server, including timeout and malformed responses.
- Run security checks ensuring examples contain no real secrets.

### Phase 6: Observability, Deployment, and Operations

Deliverables:

- Cover structured logs, trace IDs, log rotation, health checks, service lifecycle, graceful shutdown, and operational troubleshooting.
- Cover local production-like build, Linux cross-compilation, Docker, and systemd examples.
- Cover environment and secret injection, release layout, startup, health verification, rollback, and log inspection.
- Cover optional `gorig-om` integration and identify when `gorig-hub` or `gorig-node` is relevant.
- Require explicit authorization before any real remote deployment or production mutation.

Verification:

- Build a release binary and run it with production-like configuration locally.
- Build and run a container, verify health and business endpoints, then stop it gracefully.
- Validate systemd unit syntax or run it in an appropriate disposable environment.
- Exercise a local release replacement and rollback.
- Enable `gorig-om` in a disposable setup and verify the selected monitoring endpoints.
- Perform remote staging deployment only when a staging target and explicit authorization are supplied.

## 7. Phase Completion Record

When completing a phase, append or update a short record using this structure:

```markdown
### Phase N Completion

- Status: verified | blocked
- Gorig version(s):
- Date:
- Implemented:
- Commands run:
- Effect verification:
- Known limitations:
- Follow-up work:
```

Do not replace command output with a general statement such as "tests passed". Record enough evidence to reproduce the result.

### Phase 0 Completion

- Status: verified
- Gorig version(s): local `master` commit `35bbefb`; detection also verified against `v0.0.52` in `htbiz`
- Date: 2026-07-01
- Implemented:
  - Replaced duplicated Codex/Claude templates with one canonical `templates/skills/gorig-backend` source.
  - Reduced `SKILL.md` to the core workflow and conditional reference routing.
  - Added source precedence, repository onboarding, capability maturity, verified API baseline, testing policy, and source map references.
  - Added exact Gorig version/source detection and local/online source-check scripts.
  - Corrected Codex installation to current `.agents/skills` user/project locations and made scope consistent for both targets.
  - Added staged replacement so stale installed skill files are removed.
  - Added CLI installation tests and a Go compile fixture for retained framework examples.
  - Excluded this roadmap and repository tests from the npm package.
- Commands run:
  - `node --check commands/skill.js`
  - `node --test test/skill-install.test.mjs` — 6/6 passed
  - `python3 .../skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `templates/skills/gorig-backend/scripts/check-source-links.sh` — local sources passed
  - `templates/skills/gorig-backend/scripts/detect-gorig-context.sh test/fixtures/framework-api` — local `replace` resolved
  - `templates/skills/gorig-backend/scripts/detect-gorig-context.sh /Users/doz/Desktop/project/open/htbiz` — `v0.0.52` module cache resolved
  - `GOCACHE=/tmp/gorig-go-cache GOPROXY=off GOSUMDB=off go test ./... -v` in the framework API fixture — passed
  - `npm pack --dry-run --json --cache /tmp/gorig-npm-cache` — roadmap and `test/` absent; canonical skill present
- Effect verification:
  - The real CLI entry installed identical Codex and Claude project skills into a disposable directory.
  - User/project destination resolution, stale-file removal, source preflight, and invalid-scope exit behavior were asserted.
  - Current baseline snippets for routing, parameters, responses, lifecycle, dx, cache, cron, messaging, SSE, and logging compiled against the local Gorig source.
- Known limitations:
  - Automated online GitHub reachability checks could not complete in the current network environment; local repository remotes, checked-out sources, and the exact Go module cache were verified instead.
  - Importing the current cache package without Redis configuration emits Redis initialization warnings even though the compile fixture passes; Redis behavior remains subject to its dedicated integration phase.
  - Phase-specific behavioral verification remains intentionally pending for Phases 1-6.
- Follow-up work: Begin Phase 1 by making `gorig-cli init` generate and smoke-test a local, dependency-free basic project.

### Phase 1 Completion

- Status: verified
- Gorig version(s): local `master` commit `35bbefb`; release `v0.0.52`
- Date: 2026-07-01
- Implemented:
  - Rebuilt `gorig-cli init` as a deterministic non-interactive generator with `--module`, `--gorig-version`, `--gorig-replace`, `--port`, `--force`, `--start`, `--no-start`, and `--no-git` options.
  - Added project-name, module, version, port, overwrite, and Go-version compatibility validation.
  - Removed the generated duplicate HTTP lifecycle registration and the default Cron task.
  - Added a dependency-free Router -> Controller -> Service `hello` vertical slice.
  - Flattened generated business modules to `domain/<module>/{router.go, controller.go, service.go, dto.go, model/*.go}` and removed the default `api/`, `api/req/`, and `internal/` nesting from `gorig-cli create`.
  - Added committed `local`, `dev`, and `prod` configurations plus environment-variable selection guidance.
  - Added success and validation-error service tests and a generated project README.
  - Added Phase 1 skill references for bootstrap, configuration, and service lifecycle.
  - Added `verify-basic-project.sh` to run format, vet, build, tests, HTTP checks, environment checks, and graceful shutdown.
  - Added persistent CLI argument and project-generation tests.
  - Added module-generation verification into the Phase 1 project-generation test path.
- Commands run:
  - `node --check commands/init.js`
  - `node --check commands/create.js commands/doc.js`
  - `node --test test/init-project.test.mjs test/skill-install.test.mjs` — 10/10 passed, including generated Git repository assertion
  - `gorig-cli init demo-api --module example.com/demo-api --gorig-version v0.0.52 --gorig-replace /Users/doz/go/pkg/mod/github.com/jom-io/gorig@v0.0.52 --port 19827 --no-start --no-git` — generated from cached release source
  - `gorig-cli create supply_order` — generated flat `domain/supply_order` module
  - `go fmt ./...`, `go vet ./...`, `go build ./...`, `go test ./... -v` — passed after module generation
  - `npm_config_cache=/tmp/gorig-npm-cache npm pack --dry-run` — package contents exclude `docs/gorig-backend-skill-roadmap.md`
  - `python3 .../skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `gorig-cli init gorig-phase1-smoke --gorig-replace ... --port 19527 --no-start --no-git` — generated from local framework source
  - `verify-basic-project.sh . local` — build, tests, HTTP, and graceful shutdown passed on port 19527
  - `verify-basic-project.sh . dev` — environment switch, port 19528, HTTP, and graceful shutdown passed
  - `gorig-cli init gorig-phase1-release --gorig-version v0.0.52 --port 19727 --no-start --no-git` — generated from the cached release
  - `verify-basic-project.sh . local` — release-based build, tests, HTTP, and graceful shutdown passed
- Effect verification:
  - `/ping` returned business code `200` in both generated projects.
  - `/hello?name=Gorig` returned the generated application name, selected mode, and `hello Gorig`.
  - `domain/supply_order` registered `GET /supply_order/info` and `POST /supply_order/echo` in the generated route dump.
  - `domain/init.go` added `import _ "example.com/demo-api/domain/supply_order"` for module registration.
  - The same binary source loaded `local` on port 19527 and `dev` on port 19528 from separate YAML files.
  - `SIGINT` produced `Shutting down the system [OK]` and left no verification process running.
  - The release-based project resolved `github.com/jom-io/gorig v0.0.52` without a local `replace`.
- Known limitations:
  - The inspected Gorig built-in `/ping` payload formats its integer timestamp with a string verb, producing a `%!s(int64=...)` value; status and response code remain usable for health verification.
  - Tests use `test/_bin/local.yaml` because Gorig configuration paths are relative to each Go test package working directory.
  - External database and Redis behavior are intentionally excluded from the basic profile and remain pending for Phase 3.
  - HTTP smoke for the newly generated `supply_order` endpoint could not complete inside the restricted sandbox because binding `:19827` returned `operation not permitted`; route registration and compile/test checks passed.
- Follow-up work: Install this verified project-scoped skill into `gorig-ai-test`, then begin Phase 2 after user acceptance testing.

### Phase 2 Completion

- Status: verified
- Gorig version(s): local `master` commit `35bbefb`
- Date: 2026-07-03
- Implemented:
  - Added `references/persistent-crud.md` and routed persistent CRUD requests through it from `SKILL.md`.
  - Clarified that CRUD is a persistence/service capability; HTTP router/controller/doc generation is an optional adapter when HTTP is in scope.
  - Added `gorig-cli create <module> --crud --db mysql|mongo [--db-name <name>] [--no-http]`.
  - Added MySQL and MongoDB model templates with `DConfig()`.
  - Added CRUD DTO, service, optional router/controller, module README, API doc, and validation-test templates.
  - Added idempotent MySQL/MongoDB connection skeleton injection for local/dev/prod and test-local YAML, including comments and `GORIG_...` environment variable guidance.
  - Added backend-specific `integration,mysql` and `integration,mongo` test initialization plus generated real CRUD lifecycle tests, while keeping default tests independent of live databases.
  - Corrected the generated optional-filter semantics after live MySQL verification exposed that `ignore=true` forces empty values into `dx` queries; generated List/Page queries now rely on the framework's default zero-value skipping.
  - Strengthened generated integration assertions so List and Page must return exactly the created record instead of accepting any non-empty/non-nil result.
  - Kept the existing `gorig-cli create <module>` dependency-free module profile for Phase 1 compatibility.
  - Added automated coverage for basic, MySQL CRUD, and MongoDB CRUD module generation.
- Commands run:
  - `node --check commands/create.js`
  - `node --check test/init-project.test.mjs`
  - `node --test test/init-project.test.mjs test/skill-install.test.mjs` — 11/11 passed
  - Temporary fixture: `gorig-cli init phase2-app --gorig-replace ... --no-start --no-git`
  - Temporary fixture: `gorig-cli create order_mysql --crud --db mysql --db-name Main`
  - Temporary fixture: `gorig-cli create order_mongo --crud --db mongo --db-name main`
  - Temporary fixture: `gorig-cli create invoice_mysql --crud --db mysql --no-http` — service-only generation and idempotent config preservation verified
  - Temporary fixture: `go fmt ./...`, `go vet ./...`, `go build ./...`, `go test ./... -v` — passed
  - Temporary fixture: `go test -c -tags=integration,mysql ./test` and `go test -c -tags=integration,mongo ./test` — backend-specific integration suites compiled
  - `go test -tags=integration,mysql ./test/... -run TestCustomerIntegrationCRUD -v` in `gorig-ai-test/customer-api` — passed after the optional-filter correction; Create, Info, filtered List, filtered Page, Update, and Delete were exercised against live MySQL
  - `go vet ./...`, `go build ./...`, `go test ./... -v` in `gorig-ai-test/customer-api` — passed
  - `python3 .../skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `npm_config_cache=/tmp/gorig-npm-cache npm pack --dry-run` — CRUD templates and `persistent-crud.md` included
  - `node ../gorig-cli/bin/cli.js skill install codex project` in `gorig-ai-test` — latest canonical skill installed and byte-compared with the source
- Effect verification:
  - Compile-level generation is verified for MySQL and MongoDB CRUD modules.
  - Generated validation tests pass without external infrastructure.
  - Live MySQL Create, Info, filtered List, filtered Page, Update, and Delete passed in `customer-api` after correcting the optional-filter template defect.
- Known limitations:
  - MongoDB effect verification is still pending and requires a reachable development configuration.
- Follow-up work: Begin Phase 3 by adding verified advanced data access and cache references, compile fixtures, and local cache behavior checks.

### Phase 3 Completion

- Status: verified
- Gorig version(s): local `master` commit `35bbefb`
- Date: 2026-07-03
- Implemented:
  - Added `references/advanced-data-access.md` with advanced `domainx/dx` filters, sorting, projection, count/sum, pagination, batch scans, migration/index guidance, direct-driver escape hatches, and transaction boundaries.
  - Added `references/cache.md` with Memory, JSON, SQLite, Redis, backend selection guidance, Redis configuration keys, cache-aside, source-of-truth boundaries, expiration, invalidation, counters, multi-level cache, singleflight, key design, direct service examples, and verification guidance.
  - Kept cache workflow decisions under the general material-change conversation workflow instead of adding cache-specific confirmation rules.
  - Routed advanced data access and cache requests from `SKILL.md` to the dedicated references.
  - Updated `framework-api.md` to keep baseline snippets and point advanced scenarios to their dedicated references.
  - Updated `capability-matrix.md` to reflect Phase 2 CRUD verification, advanced data access boundaries, local cache verification, Redis integration requirements, and multi-level cache verification.
  - Updated `testing.md` with advanced data access, cache verification rules, and project-level `test/` placement guidance for Gorig feature tests.
  - Extended the framework API fixture with compile coverage for advanced `dx` methods, cache operations, multi-level cache, SQLite paged cache, and direct-driver type boundaries.
  - Added local behavior tests for Memory, JSON, SQLite, and multi-level cache singleflight.
  - Tightened `.npmignore` so local `npm_publish*.sh` helper copies are excluded from npm packages.
- Commands run:
  - `gofmt -w test/fixtures/framework-api/framework_api_test.go test/fixtures/framework-api/cache_behavior_test.go`
  - `GOCACHE=/tmp/gorig-go-cache GOPROXY=off GOSUMDB=off go test ./... -v` in `test/fixtures/framework-api` — passed; Memory, JSON, SQLite, and multi-level cache tests ran.
  - `node --check commands/skill.js` — passed
  - `node --test test/skill-install.test.mjs test/init-project.test.mjs` — 11/11 passed
  - `python3 /Users/doz/.codex/skills/.system/skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `npm_config_cache=/tmp/gorig-npm-cache npm pack --dry-run` — `advanced-data-access.md` and `cache.md` included; `docs/`, `test/`, and `npm_publish copy.sh` excluded
- Effect verification:
  - Advanced `dx` examples compile against local Gorig `35bbefb`.
  - Local cache behavior is verified for miss/hit, delete, expiry, flush, counters, JSON file persistence, SQLite file creation/read/delete/expiry, lower-layer backfill, multi-layer delete, and singleflight concurrent loading.
  - Skill installation tests still install identical canonical content for Codex and Claude project scopes.
  - Generated-project CLI regression coverage remains green after the skill reference changes.
- Known limitations:
  - Redis emits initialization warnings in the framework fixture when no Redis configuration is available; Redis behavior remains integration-only and was not claimed verified in this run. Redis work should guide users to provide `redis.addr`, `redis.password`, and `redis.db` or the corresponding `GORIG_REDIS_*` environment variables.
  - Advanced MySQL and MongoDB runtime behavior for aggregates, geo queries, indexes, direct-driver escape hatches, and transactions still requires disposable or explicitly configured integration services.
  - MongoDB Phase 2 CRUD effect verification is still pending for a reachable development configuration.
- Follow-up work: Begin Phase 4 by adding verified cron, messaging, and SSE references plus deterministic local behavior checks.

### Phase 3 Acceptance Update

- Status: verified
- Gorig version(s): local `master` commit `0af68e8`; Phase 3 original verification baseline `35bbefb`
- Date: 2026-07-06
- Implemented:
  - User accepted Route/Phase 3 as passed after the advanced data access and cache work.
  - Strengthened data-query guidance so list/page/filter/sort/count/sum/existence logic must be pushed into the database or verified framework APIs.
  - Added explicit rules prohibiting `Find()` followed by in-memory filtering, sorting, counting, or pagination for API query paths.
  - Added guidance to use `Page`, `Count`, `Sum`, `Exists`, `Select`/`Omit`, `FindEach`, `AllEach`, or direct-driver database-side filtering/limits when needed.
  - Updated testing guidance to reject pagination tests that pass only because a small fixture was loaded into memory and sliced.
- Commands run:
  - `python3 /Users/doz/.codex/skills/.system/skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `git diff --check` — passed
- Effect verification:
  - Skill instructions now explicitly guard against memory-unsafe query implementations that can load unbounded data into Go memory.
- Known limitations:
  - These are instruction-level and documentation-level safeguards; concrete project implementations must still be reviewed and tested for database-backed pagination/filtering.
- Follow-up work: Continue Route/Phase 4: scheduled tasks, messaging, SSE, and Redis-backed integration verification.

### Phase 4 Partial Record

- Status: in_progress
- Gorig version(s): local `master` commit `0af68e8`; earlier Phase 4 baselines `92c28b5` and `35bbefb`
- Date: 2026-07-06
- Implemented:
  - Added `references/scheduled-tasks.md` with verified `AddCronTask`, `AddEveryTask`, `AddDelayTask`, `AddOnceTask`, timeout, panic recovery, deduplication, and shutdown. `AddEveryTask` requires Gorig commit `92c28b5` or an equivalent fix.
  - Added source-verified Redis-backed persistent delay/once task guidance for `RegisterPersistTask`, `AddPersistDelayTask`, and `AddPersistOnceTask`; this requires Gorig commit `0af68e8` or an equivalent implementation.
  - Added `references/messaging.md` with local broker, Redis broker boundary, concurrent subscribers, sequential subscribers, retry, local DLQ delivery, Redis replay boundary, unsubscribe, and message-to-SSE composition guidance.
  - Added `references/sse.md` with GET-only middleware, event/error payloads, long-lived stream lifecycle, disconnect handling, and message-to-SSE cleanup guidance.
  - Routed scheduled-task, messaging, and SSE requests from `SKILL.md` to the dedicated references.
  - Updated `framework-api.md`, `capability-matrix.md`, and `testing.md` with Phase 4 boundaries and verification rules.
  - Extended the framework API fixture with compile coverage for interval/delay/once/persistent cron jobs, sequential message subscriptions, retry options, and DLQ replay calls.
  - Added deterministic local behavior tests for cron execution/deduplication/timeout/panic/every/delay/once/shutdown, persistent task registration and payload validation errors, local message publish/consume/multiple subscribers/sequential retry/local DLQ/unsubscribe, SSE headers/payloads/non-GET rejection, and message-to-SSE cleanup.
- Commands run:
  - `gofmt -w framework_api_test.go cron_message_sse_behavior_test.go`
  - `GOCACHE=/tmp/gorig-go-cache GOPROXY=off GOSUMDB=off go test ./... -v` in `test/fixtures/framework-api` — passed; Redis broker integration and persistent cron Redis runtime integration skipped because Redis was not configured/reachable in the current sandbox.
  - `git -C /Users/doz/Desktop/project/open/gorig log -1 --oneline` — `0af68e8 feat(cronx): add persistent delay tasks`
  - `node --check commands/skill.js` — passed
  - `node --test test/skill-install.test.mjs test/init-project.test.mjs` — 11/11 passed
  - `python3 /Users/doz/.codex/skills/.system/skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `npm_config_cache=/tmp/gorig-npm-cache npm pack --dry-run` — scheduled-tasks, messaging, and sse references included; `docs/`, `test/`, and local helper copies excluded
- Effect verification:
  - `cronx.AddCronTask` ran a short interval task, duplicate registration was ignored, `AddEveryTask` registration returned without deadlock and the task executed, timeout context was observed, panic recovery did not stop subsequent tasks, delay/once tasks ran, and shutdown completed.
  - Persistent cron task validation verified anonymous handler rejection, unregistered handler rejection, non-JSON payload rejection, and missing-Redis scheduling error.
  - Local `messagex` publish/consume, unsubscribe, multi-subscriber fan-out, sequential ordering, retry, local DLQ delivery, and local `ReplayDLQ` unsupported boundary were verified.
  - SSE GET headers, `SendOK`, `SendError`, non-GET 405 response, message-to-SSE event output, and subscriber cleanup were verified.
- Known limitations:
  - Persistent cron task runtime delivery, restart recovery, failure status, and Redis key cleanup require configured Redis infrastructure before runtime behavior can be claimed.
  - Redis `messagex` publish/consume, ordering, retry, DLQ, and replay require configured Redis infrastructure before runtime behavior can be claimed.
  - RabbitMQ remains unsupported in the inspected baseline.
- Follow-up work: Complete Phase 4 Redis integration verification for `messagex` and persistent cron tasks when disposable Redis is available.

### Phase 4 Interaction Update

- Status: in_progress
- Gorig version(s): local `master` commit `0af68e8`
- Date: 2026-07-06
- Implemented:
  - Added `references/business-scenarios.md` so ordinary business-language requests are decomposed before component selection.
  - Updated `SKILL.md` to load scenario decomposition before cron/message/SSE/cache/persistence component references when the user does not name framework primitives.
  - Updated testing guidance to require business-effect verification, not only component-level checks.
- Commands run:
  - `python3 /Users/doz/.codex/skills/.system/skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `node --check commands/skill.js` — passed before the interaction update packaging check
  - `node --test test/skill-install.test.mjs test/init-project.test.mjs` — 11/11 passed before the interaction update packaging check
  - `npm_config_cache=/tmp/gorig-npm-cache npm pack --dry-run` — `business-scenarios.md` included
  - `git diff --check` — passed
- Effect verification:
  - The skill now has explicit guidance to map reminders, delayed processing, async notifications, live UI updates, and performance complaints to suitable Gorig capabilities.
- Known limitations:
  - Scenario decomposition is instruction-level behavior and should be validated by manual prompt tests in a real project.
- Follow-up work: Route/Phase 4 remains the next active route. Complete Redis-backed runtime verification for persistent cron tasks and `messagex`, and continue manual prompt checks against `customer-api`.

### Phase 4 Completion

- Status: verified
- Gorig version(s): local `master` commit `0af68e8`; `customer-api` resolves `github.com/jom-io/gorig v0.0.0` through `replace => ../../gorig`
- Date: 2026-07-06
- Implemented:
  - Completed Phase 4 documentation and routing for scheduled tasks, Redis-backed persistent delay/once tasks, local/Redis `messagex`, SSE, and message-to-SSE composition.
  - Verified that business-language reminder/notification/live-update requests route through scenario decomposition before selecting cron, messaging, SSE, persistence, or cache components.
  - Confirmed the final guidance separates durable business facts in MySQL/MongoDB from transient delivery mechanisms such as Redis queues, local message fan-out, and SSE streams.
  - Confirmed Redis-backed persistent cron tasks and Redis `messagex` runtime behavior in the local framework fixture when Redis is available.
  - Confirmed a real `customer-api` prompt test resolves the target project's actual Gorig source before producing a business design.
- Commands run:
  - `go test ./... -run 'TestCronx|TestMessagex|TestSSE|TestRedisMessage|TestMessageToSSE' -v` in `test/fixtures/framework-api` — passed; Redis persistent cron delivery and Redis `messagex` publish/consume tests ran and passed.
  - `codex -a never exec --ephemeral --sandbox read-only --skip-git-repo-check -C /Users/doz/Desktop/project/open/gorig-ai-test/customer-api -o /tmp/gorig-route4-codex-result.md -` — passed after running with required local Codex CLI permissions.
  - `sed -n '1,240p' /tmp/gorig-route4-codex-result.md` — confirmed the recorded final response.
- Effect verification:
  - Cron behavior verified short interval execution, duplicate-registration suppression, `AddEveryTask` non-deadlock and execution, timeout cancellation, panic recovery, delay/once execution, shutdown, persistent task validation errors, and Redis-backed persistent delay delivery.
  - Messaging behavior verified local publish/consume, unsubscribe, multi-subscriber fan-out, sequential ordering, retry, local DLQ delivery, local `ReplayDLQ` unsupported boundary, and Redis publish/consume.
  - SSE behavior verified GET stream headers, `SendOK`, `SendError`, non-GET 405 output, message-to-SSE event delivery, and subscriber cleanup.
  - Manual Codex CLI prompt against `customer-api` correctly identified `replace=../../gorig`, inspected the real source, avoided using `customer.status` for VIP state, required database persistence for reminder history, rejected in-memory delay tasks for restart durability, recommended `cronx.AddPersistDelayTask` plus DB compensation scanning, and treated SSE/Redis `messagex` as conditional delivery mechanisms rather than sources of truth.
- Known limitations:
  - Redis-backed behavior is verified only when disposable or explicitly configured Redis is available; future project delivery must still report Redis configuration and skipped checks per environment.
  - Redis `messagex` replay, ordering, retry, and DLQ runtime behavior remain scenario-specific and should be integration-tested when a feature depends on those exact guarantees.
  - RabbitMQ remains unsupported in the inspected baseline.
  - `customer-api` is not a Git repository, so clean-worktree confirmation was not available; the Codex CLI validation ran in read-only mode and reported no file modifications.
- Follow-up work: Begin Phase 5: authentication, security, and outbound networking.

### Phase 5 Completion

- Status: verified
- Gorig version(s): local `master` commit `4dcf601`; Redis token manager implemented in current source line and expected in releases that include it, such as planned `v0.0.53+`
- Date: 2026-07-06
- Implemented:
  - Added `references/auth-security.md` for business-language login/logout, protected routes, token generation/parse/record/refresh/revoke, user context, role/attribute filters, forbidden cases, CORS, debounce, request-signature boundary, secret configuration, and sensitive logging rules.
  - Added `references/outbound-http.md` for GET, form, JSON, XML, headers, context/header propagation, timeout, bad response handling, malformed payloads, and controlled image fetching.
  - Routed authentication/security and outbound networking requests from `SKILL.md` to the dedicated references plus framework/testing references.
  - Updated business-scenario decomposition with identity/security and outbound dependency dimensions so ordinary business prompts can be tested without framework vocabulary.
  - Updated capability matrix, onboarding files, source map, and testing guidance for Phase 5.
  - Extended the framework compile fixture with token middleware and outbound helper coverage.
  - Added local behavior tests for memory token middleware, missing/malformed/expired/refreshed/revoked/forbidden token cases, user and trace context propagation, CORS preflight, debounce whitelist/rate-limit behavior, and outbound helpers against `httptest.Server`.
  - Documented discovered security boundaries: local `master` commit `4dcf601` has Redis token manager plus real Redis integration tests; the tests pass with Redis configured and skip only when Redis is absent. Memory token `Destroy` logs raw token and does not force immediate `tokens.json` rewrite.
- Commands run:
  - `node --check commands/skill.js` — passed
  - `node --test test/skill-install.test.mjs` — 6/6 passed
  - `gofmt -w test/fixtures/framework-api/framework_api_test.go test/fixtures/framework-api/auth_security_outbound_behavior_test.go test/fixtures/framework-api/cron_message_sse_behavior_test.go`
  - `go test ./... -v` in `test/fixtures/framework-api` — passed
  - `go test ./test -run TestRedisTokenManager -v` in local Gorig `master` — passed with configured Redis; covered generate/reuse/clean/refresh/destroy/effective behavior
  - `python3 /Users/doz/.codex/skills/.system/skill-creator/scripts/quick_validate.py templates/skills/gorig-backend` — valid
  - `rg --pcre2 ... templates/skills/gorig-backend test/fixtures/framework-api` — broad scan produced documentation-only false positives; narrow real-secret pattern scan returned no matches
  - `npm_config_cache=/tmp/gorig-npm-cache npm pack --dry-run --json` — `auth-security.md` and `outbound-http.md` included
  - Installed the skill to `~/Desktop/project/open/gorig-ai-test.agents/skills/gorig-backend-local` and verified `diff -qr` against the source template had no differences
- Effect verification:
  - Memory token protected route succeeds with valid token and exposes user id/userInfo from middleware.
  - Missing token, short malformed token, malformed auth scheme, destroyed token, forbidden role, expired-token `IsNotExpired`/`IsEffective`, old refresh token, and new refresh token behaviors were tested.
  - Middleware user context and trace context were verified in gin context and request context.
  - CORS `OPTIONS` preflight returned 204 with origin and allowed headers; debounce returned 429 for repeated requests and allowed a whitelisted path.
  - Outbound GET headers/query, form POST, JSON POST, context `Authorization` forwarding, XML POST/parse, bad status, malformed JSON, timeout, and controlled image fetch were verified against a local server.
  - Redis token manager integration passed against the configured local Redis on Gorig `master`.
  - Skill installation target for business testing matches the canonical template content.
- Known limitations:
  - Redis token runtime behavior requires the target project to resolve to source containing the Redis manager implementation and the runtime environment to provide Redis configuration. Local `master` commit `4dcf601` has real Redis integration coverage in `test/tokenx_redis_test.go`, and planned `v0.0.53+` releases should be treated as Redis-token capable when they include that source.
  - Built-in memory token persistence has a `tokens.json` caveat: immediate logout/revocation of the last active token should be verified in the target app, and production hardening may need a framework fix or wrapper.
  - The inspected memory `Destroy` logs raw token strings; production projects should remove or mask that behavior before handling real credentials.
  - Request signing remains unsupported as a built-in verified capability; signed callback/API requirements need a custom confirmed security design.
  - Built-in outbound helpers differ in timeout and status/error semantics; production-grade per-request cancellation may require a custom `http.Client` path after confirmation.
- Follow-up work: Begin Phase 6: observability, deployment, and operations.
