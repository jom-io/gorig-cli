# Capability Maturity Matrix

This baseline reflects the locally inspected Gorig `master` from 2026-05-13. Re-evaluate it for the target project's resolved version.

| Capability | Baseline | Verification source | Important boundary |
|---|---|---|---|
| `bootstrap.StartUp` and `serv` lifecycle | verified | `bootstrap/startup.go`, `serv/serv.go` | Service startup order uses map iteration; do not depend on ordering. |
| HTTP server, routing, recovery, logging, CORS | verified | `httpx/serv.go`, middleware, HTTP tests | `RegisterRouter` currently accepts `func(*gin.RouterGroup)`; the built-in `/ping` payload has a timestamp formatting defect in the inspected baseline. |
| `apix` binding, typed parameters, response handling | verified | `apix/params.go`, `apix/handle.go` | Typed getters and `HandleData` signatures are version-sensitive. |
| Persistent CRUD module workflow | experimental | `references/persistent-crud.md`, `domainx/dx` source | Phase 2 target. Supports only MySQL and MongoDB in the verified workflow; HTTP is an optional adapter, not required for service-level CRUD. DB integration must be proven against available development infrastructure. |
| MySQL and MongoDB adapters | verified | `domainx` adapters and `test/dx_test.go` | Requires external services and matching configuration. |
| `domainx/dx` query facade | verified | `domainx/dx/dx.go`, real consumers | Some operations require an ID or non-empty matches as a safety guard. |
| Memory, JSON, SQLite, Redis cache | verified | `cache/`, `test/cache_test.go` | Redis requires configured infrastructure. |
| Multi-level cache and singleflight | verified | `cache/cache.go` | Loader and invalidation behavior must be tested per value type. |
| `cronx.AddCronTask` | verified | `cronx/cron.go`, `test/cron_test.go` | Uses second-level cron expressions and optional timeout. |
| `cronx.AddDelayTask`, `AddOnceTask` | verified | `cronx/cron.go`, tests | Confirm execution and shutdown in the selected version. |
| `cronx.AddEveryTask` | experimental | `cronx/cron.go` | Current local source recursively locks the same mutex; do not use until fixed and tested. |
| Local and Redis `messagex` | verified | `mid/messagex/`, `test/message_test.go` | Verify cross-process Redis behavior with integration infrastructure. |
| Sequential messages, retry, DLQ | verified | `broker.simple.go`, tests | DLQ applies to sequential subscribers. |
| RabbitMQ broker enum/path | unsupported | `mid/messagex/serv.go` | No broker implementation is constructed. |
| SSE middleware and send helpers | verified | `httpx/ssex/`, `test/ssex_test.go` | Endpoint must be GET and must handle disconnects. |
| Memory-backed JWT token manager | experimental | `mid/tokenx/`, real consumers | Expiry semantics and local token persistence require scenario tests. |
| Redis token manager and `SignRedis` | unsupported | `mid/tokenx/serv.go` | Redis manager branch is not implemented. |
| Structured logging and trace context | verified | `utils/logger/`, logger tests | Propagate the request context instead of replacing it mid-request. |
| Gorig OM integration | experimental | `gorig-om` | Separate repository and configuration; validate against its pinned Gorig version. |
| Gorig Hub and Node | experimental | `gorig-hub`, `gorig-node` | Ecosystem components, not automatic core-framework behavior. |

Update this matrix whenever source inspection or effect verification changes a status.
