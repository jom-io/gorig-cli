# Cache

Use this reference when a task needs cached reads, local persistence, Redis-backed cache, counters, multi-level cache, cache invalidation, or SQLite paged cache.

Always inspect the target project's resolved Gorig source first. The examples below reflect the locally inspected Gorig `master` commit `35bbefb`.

## Backends

The inspected cache package exposes one generic interface:

```go
type Cache[T any] interface {
    Get(key string) (T, error)
    Set(key string, value T, expiration time.Duration) error
    Del(key string) error
    Exists(key string) (bool, error)
    RPush(key string, value T) error
    BRPop(timeout time.Duration, key string) (T, error)
    Incr(key string) (int64, error)
    Expire(key string, expiration time.Duration) error
    Flush() error
}
```

Create typed caches with `cache.New[T]`:

```go
memory := cache.New[Order](cache.Memory, time.Minute, time.Minute)
jsonFile := cache.New[Order](cache.JSON, "orders")
sqlite := cache.New[Order](cache.Sqlite, "orders")
redis := cache.New[Order](cache.Redis)
```

Backend notes:

- Memory is process-local and disappears on restart.
- JSON persists under `.cache/<name>.json` and is useful for small local data.
- SQLite persists under `.cache/<name>.db` and is useful for local durable cache values.
- Redis requires configured Redis infrastructure. Do not claim Redis behavior is verified from compile-only checks.

Check initialization and handle errors before depending on a cache:

```go
if memory == nil || !memory.IsInitialized() {
    return errors.Sys("memory cache is not initialized")
}
```

## Backend Choice

Choose the cache backend from the target project's runtime needs and existing conventions.

Supported Gorig cache backends in the inspected baseline:

| Backend | Use when | Configuration |
|---|---|---|
| Memory | Fast process-local acceleration; loss on restart is acceptable. | No external config. |
| JSON | Small local durable cache values are useful during development or simple deployments. | Cache name creates `.cache/<name>.json`. |
| SQLite | Local durable cache values need better structure than JSON. | Cache name creates `.cache/<name>.db`; paged cache creates `.cache/<name>.pg.db`. |
| Redis | Cross-process cache, shared deployment cache, or explicit Redis requirement. | Requires `redis.addr`, `redis.password`, `redis.db`, or `GORIG_REDIS_*` overrides. |

Selection rules:

- When the backend is not specified, inspect existing project conventions and present reasonable backend options with tradeoffs.
- If the project already has a cache helper, key convention, TTL convention, or versioning scheme, prefer extending that pattern.
- If Redis is selected or already established by the project, inspect Redis configuration before implementing.
- If local cache is selected, prefer Memory for disposable acceleration, JSON or SQLite only when restart persistence is useful.
- Do not introduce counters, multi-level cache, Redis, or other infrastructure unless the request requires them.
- Treat cache as an acceleration layer unless the feature explicitly accepts loss, expiry, and cross-process state behavior.

## Redis Configuration

Before implementing Redis-backed cache or multi-level cache, inspect `_bin/local.yaml`, `_bin/dev.yaml`, `_bin/prod.yaml`, test config under `test/_bin/`, and deployment environment variables.

The inspected cache package reads these keys:

```yaml
redis:
  addr: 127.0.0.1:6379
  password: ""
  db: 0
```

Environment overrides use Gorig's `GORIG` prefix and `.` -> `_` replacement:

- `redis.addr` -> `GORIG_REDIS_ADDR`
- `redis.password` -> `GORIG_REDIS_PASSWORD`
- `redis.db` -> `GORIG_REDIS_DB`

Guidance:

- Do not silently add Redis as a project dependency for Memory, JSON, or SQLite cache work.
- When Redis is required and config is missing, use either non-secret skeleton keys in environment YAML files or rely on environment variables.
- Never commit real Redis passwords or private connection strings.
- Prefer `redis.addr` values such as `127.0.0.1:6379` for disposable local development and environment variables for shared environments.
- In the inspected baseline, an empty `redis.addr` logs an initialization warning and Redis cache creation returns nil after the failed ping. Treat that as unavailable infrastructure, not as verified Redis behavior.
- For tests, add Redis config only to disposable test configuration or inject `GORIG_REDIS_ADDR`, `GORIG_REDIS_PASSWORD`, and `GORIG_REDIS_DB` for the test process.

When adding a skeleton, keep secrets empty:

```yaml
redis:
  addr: 127.0.0.1:6379
  password: ""
  db: 0
```

## Cache-Aside Pattern

Use cache-aside when the database or external service remains the source of truth.

```go
key := fmt.Sprintf("order:%d", id)

if item, err := orderCache.Get(key); err == nil {
    return &item, nil
}

item, err := LoadOrderFromDB(ctx, id)
if err != nil {
    return nil, err
}
if err := orderCache.Set(key, *item, 5*time.Minute); err != nil {
    logger.Error(ctx, "set order cache failed", zap.Error(err))
}
return item, nil
```

After writes, delete or refresh every affected key:

```go
if err := SaveOrder(ctx, req); err != nil {
    return err
}
_ = orderCache.Del(fmt.Sprintf("order:%d", req.ID))
_ = orderCache.Del(fmt.Sprintf("order:list:%s", req.TenantID))
```

Prefer deletion over stale overwrites when list keys, permission scopes, or computed projections are hard to enumerate.

## Direct Service Example

Use this pattern for a detail query such as `customer.Info(ctx, id)`. Keep the exact DTO/model names from the target project.

```go
var customerInfoCache = cache.New[Resp](cache.Redis)

const customerInfoTTL = 5 * time.Minute

func customerInfoKey(id uint64) string {
    return fmt.Sprintf("customer:info:%d", id)
}

func Info(ctx context.Context, id uint64) (*Resp, *errors.Error) {
    key := customerInfoKey(id)
    if customerInfoCache != nil && customerInfoCache.IsInitialized() {
        if cached, err := customerInfoCache.Get(key); err == nil {
            return &cached, nil
        }
    }

    d, err := dx.On[model.D](ctx).WithID(id).Get()
    if err != nil {
        return nil, err
    }
    resp := ToResp(d)

    if customerInfoCache != nil && customerInfoCache.IsInitialized() {
        _ = customerInfoCache.Set(key, *resp, customerInfoTTL)
    }
    return resp, nil
}

func invalidateCustomerInfo(id uint64) {
    if customerInfoCache != nil && customerInfoCache.IsInitialized() {
        _ = customerInfoCache.Del(customerInfoKey(id))
    }
}
```

Call `invalidateCustomerInfo(id)` after successful update or delete. If list or page queries are cached, also delete or version the affected list/page namespace after create, update, and delete.

For list/page cache keys, derive keys from normalized request DTO fields, not raw JSON:

```go
func customerListKey(req *ListReq) string {
    normalized := fmt.Sprintf("%s|%s|%s|%s", req.CustomerNo, req.Name, req.Phone, req.Status)
    sum := sha1.Sum([]byte(normalized))
    return fmt.Sprintf("customer:list:%x", sum)
}
```

When caching paginated responses whose result field is `any`, prefer a typed local cache DTO and convert back to the framework response after `Get`.

## Source of Truth Boundary

Cache is acceptable as an acceleration layer when:

- misses can be loaded from a durable source,
- stale values are tolerable within the TTL,
- invalidation is deterministic enough for the business workflow, and
- the service can continue safely if the cache is empty.

Cache is not an acceptable source of truth for:

- money, inventory, permissions, audit events, or legal records,
- uniqueness checks that require durable consistency,
- workflows where lost local files after restart would corrupt state,
- cross-process state unless Redis or another shared backend is explicitly configured and tested.

## Expiration and Invalidation

```go
err := c.Set("session:123", value, 30*time.Minute)
ok, err := c.Exists("session:123")
err = c.Expire("session:123", 5*time.Minute)
err = c.Del("session:123")
err = c.Flush()
```

Use `0` expiration only when the backend and business semantics allow no expiry. Avoid `Flush` in request paths unless the cache namespace is disposable.

## Counters

```go
counter := cache.New[int64](cache.Memory, time.Minute, time.Minute)
next, err := counter.Incr("job:attempts")
```

`Incr` is useful for local counters and Redis counters. It is not a substitute for durable database counters when exact cross-process consistency is required.

## Multi-Level Cache and Singleflight

`NewCacheTool` searches cache layers in order. On lower-layer hit it backfills earlier layers. On full miss it calls the loader through `singleflight`, then stores the loaded value in every layer.

```go
l1 := cache.New[Order](cache.Memory, time.Minute, time.Minute)
l2 := cache.New[Order](cache.Redis)

tool := cache.NewCacheTool[Order](ctx, []cache.Cache[Order]{l1, l2}, func(key string) (Order, error) {
    return LoadOrderByCacheKey(ctx, key)
})

value, err := tool.Get("order:123", 5*time.Minute)
err = tool.Set("order:123", value, 5*time.Minute)
err = tool.Delete("order:123")
```

Use this pattern for hot reads with expensive loaders. Verify concurrent misses call the loader once for the same key in the target value type and backend combination.

## SQLite Paged Cache

Use SQLite paged cache for local time-series or queryable snapshots, not as a replacement for the application database.

```go
type Stat struct {
    At     int64  `json:"at" idx:"at"`
    Method string `json:"method" idx_group:"method_uri"`
    URI    string `json:"uri" idx_group:"method_uri"`
    Count  int64  `json:"count"`
}

pg, err := cache.NewSQLiteCachePage[Stat]("stat_cache")
```

The inspected implementation creates `.cache/<name>.pg.db` and auto-indexes fields from `idx` and `idx_group` tags. Verify query methods against the resolved source before using paged cache in feature code.

## Key Design

Use stable, namespaced keys:

```text
<app>:<env>:<module>:<entity>:<id>
<app>:<env>:<module>:list:<tenant>:<filter-hash>
```

Rules:

- Include tenant or permission scope when data visibility differs by user.
- Hash long filter payloads instead of embedding raw JSON.
- Do not include secrets in keys.
- Keep list keys and item keys separate so invalidation is explicit.
- Document all keys created by a service in the module README when cache behavior is part of the feature.

## Verification Checklist

Local backends:

- Memory: set, get, miss, expiry, delete, counter, flush.
- JSON: persistence file creation, get after recreate, delete, expiry.
- SQLite: persistence file creation, get after recreate, delete, expiry.
- Multi-level cache: L1 miss, L2 hit backfill, full miss loader, delete across layers.
- Singleflight: concurrent same-key misses call the loader once.

Redis:

- Run only with disposable or explicitly supplied Redis configuration.
- Verify set/get, expiry, delete, counter, and cross-process visibility.
- Report Redis as skipped when configuration is absent.

Delivery evidence must include exact commands, backend configuration, skipped checks, and whether cache is used as acceleration or as state.
