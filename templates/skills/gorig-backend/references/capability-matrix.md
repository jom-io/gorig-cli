# Capability Maturity Matrix

This baseline reflects the locally inspected Gorig `master` from 2026-05-13. Re-evaluate it for the target project's resolved version.

| Capability | Baseline | Verification source | Important boundary |
|---|---|---|---|
| `bootstrap.StartUp` and `serv` lifecycle | verified | `bootstrap/startup.go`, `serv/serv.go` | Service startup order uses map iteration; do not depend on ordering. |
| HTTP server, routing, recovery, logging, CORS | verified | `httpx/serv.go`, middleware, HTTP tests, `references/auth-security.md` | `RegisterRouter` currently accepts `func(*gin.RouterGroup)`; CORS echoes request origin and must match the business security model; the built-in `/ping` payload has a timestamp formatting defect in the inspected baseline. |
| `apix` binding, typed parameters, response handling | verified | `apix/params.go`, `apix/handle.go` | Typed getters and `HandleData` signatures are version-sensitive. |
| Persistent CRUD module workflow | verified | `references/persistent-crud.md`, generated-project tests, live MySQL verification | Supports only MySQL and MongoDB in the verified workflow; HTTP is an optional adapter, not required for service-level CRUD. MongoDB effect verification still requires reachable development infrastructure. |
| MySQL and MongoDB adapters | verified | `domainx` adapters and `test/dx_test.go` | Requires external services and matching configuration. |
| Baseline `domainx/dx` CRUD query facade | verified | `domainx/dx/dx.go`, generated CRUD tests, real consumers | Some operations require an ID or non-empty matches as a safety guard. |
| Advanced `domainx/dx` access | verified | `references/advanced-data-access.md`, `domainx/dx/dx.go`, compile fixture | External database behavior for aggregates, geo queries, indexes, escape hatches, and transactions must be integration-tested per backend. |
| Memory, JSON, and SQLite cache | verified | `references/cache.md`, local cache behavior fixture, `cache/` source | Local backends do not prove Redis or cross-process behavior. |
| Redis cache | source-verified | `cache/cache.redis.go`, `test/cache_test.go`, `references/cache.md` | Reads `redis.addr`, `redis.password`, and `redis.db`; runtime behavior requires configured Redis infrastructure before it is claimed in a delivery. |
| Multi-level cache and singleflight | verified | `cache/cache.go`, local behavior fixture | Loader and invalidation behavior must be tested per value type. |
| `cronx.AddCronTask` | verified | `references/scheduled-tasks.md`, `cronx/cron.go`, local fixture | Uses second-level cron expressions and optional timeout. |
| `cronx.AddDelayTask`, `AddOnceTask` | verified | `references/scheduled-tasks.md`, `cronx/cron.go`, local fixture | Delay/once jobs run once and start cron internally. |
| `cronx.AddEveryTask` | verified | `cronx/cron.go`, local fixture, Gorig `92c28b5` | Fixed interval helper delegates to `AddCronTask`; require commit `92c28b5` or equivalent in the target version. |
| `cronx` persistent delay/once tasks | source-verified | `cronx/persist.go`, `test/cron_persist_test.go`, local fixture | Requires Gorig `0af68e8` or later plus configured Redis. Local validation covers handler/payload errors; runtime persistence requires Redis integration. |
| Local `messagex` | verified | `references/messaging.md`, `mid/messagex/`, local fixture | Process-local only. Verify lifecycle and unsubscribe behavior per use case. |
| Redis `messagex` | source-verified | `references/messaging.md`, `mid/messagex/`, `test/message_test.go` | Requires configured Redis integration before runtime behavior is claimed. |
| Sequential messages, retry, local DLQ delivery | verified | `broker.simple.go`, local fixture | DLQ applies to sequential subscribers. Local broker cannot replay because it has no store. |
| Redis DLQ replay | source-verified | `broker.simple.go`, Redis tests | Requires configured Redis integration before runtime replay behavior is claimed. |
| RabbitMQ broker enum/path | unsupported | `mid/messagex/serv.go` | No broker implementation is constructed. |
| SSE middleware and send helpers | verified | `httpx/ssex/`, `test/ssex_test.go` | Endpoint must be GET and must handle disconnects. |
| Memory-backed JWT token manager and `SignDef` | verified | `mid/tokenx/`, `httpx/mid.sign.go`, local auth fixture, `references/auth-security.md` | Single-process default with local `./tokens.json` persistence; not cross-instance session storage. Test expiry, refresh, revoke, logout, and forbidden paths per app. |
| Redis token manager and `SignRedis` | verified | `mid/tokenx/serv.go`, `mid/tokenx/redis.manager.go`, `test/tokenx_redis_test.go` | Implemented in local `master` commit `4dcf601` and expected in releases that include the Redis manager, such as planned `v0.0.53+`. Use it with Redis configuration. The real Redis integration test covers generate/reuse/clean/refresh/destroy/effective behavior and skips only when the environment lacks Redis. |
| Role and attribute filtering | verified | `httpx.SignUserDef`, local auth fixture | Filters JWT `UserInfo` only; use service-layer authorization for database-owner or live-state rules. |
| Debounce/rate protection | verified | `httpx/mid.debounce.go`, local auth/security fixture | Process-global state; whitelist API is spelled `DebouceAw`; repeated requests key by user id when token is valid, otherwise client IP. |
| Request signing | unsupported | source search, `references/auth-security.md` | No verified generic request-signature middleware in the inspected baseline. Implement custom signing only after explicit security design confirmation. |
| Outbound HTTP helpers | verified | `httpx/http.go`, local outbound fixture, `references/outbound-http.md` | Timeout support is helper-specific and `SetTimeOutTmp` is process-global; bad JSON/XML/status behavior differs by helper. |
| Structured logging and trace context | verified | `utils/logger/`, logger tests | Propagate the request context instead of replacing it mid-request. |
| Gorig OM integration | experimental | `gorig-om` | Separate repository and configuration; validate against its pinned Gorig version. |
| Gorig Hub and Node | experimental | `gorig-hub`, `gorig-node` | Ecosystem components, not automatic core-framework behavior. |

Update this matrix whenever source inspection or effect verification changes a status.
