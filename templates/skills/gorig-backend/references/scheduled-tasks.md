# Scheduled Tasks

Use this reference when a task needs cron jobs, delayed jobs, one-shot jobs, task timeout, panic recovery, deduplication, or graceful cron shutdown.

Always inspect the target project's resolved Gorig source first. The examples below reflect the locally inspected Gorig `master` commits through `0af68e8`.

## Supported APIs

Use `github.com/jom-io/gorig/cronx`.

```go
cronx.AddCronTask("0 */5 * * * *", func(ctx context.Context) {
    logger.Info(ctx, "scheduled sync")
}, 30*time.Second)

cronx.AddDelayTask(10*time.Second, func(ctx context.Context) {
    logger.Info(ctx, "delayed sync")
}, 30*time.Second)

cronx.AddOnceTask(time.Now().Add(time.Hour), func(ctx context.Context) {
    logger.Info(ctx, "one-shot sync")
}, 30*time.Second)
```

Supported in the inspected baseline:

| API | Status | Notes |
|---|---|---|
| `AddCronTask` | verified | Accepts cron specs with seconds, including `@every` specs. Supports optional timeout context. |
| `AddDelayTask` | verified | Runs once after a delay. Internally schedules a one-shot task and starts cron. |
| `AddOnceTask` | verified | Runs once around the requested time and removes itself after execution. |
| `AddTask` | deprecated | No context support; do not use for new work. |
| `AddEveryTask` | verified | Convenience wrapper for `AddCronTask("@every <interval>")` in local Gorig commit `92c28b5` and later. |
| `RegisterPersistTask` | source-verified | Registers a named Redis-backed persistent task handler. Requires Gorig commit `0af68e8` or later. |
| `AddPersistDelayTask` | source-verified | Stores a JSON payload in Redis and runs once after a delay. Runtime verification requires Redis. |
| `AddPersistOnceTask` | source-verified | Stores a JSON payload in Redis and runs once at the requested time. Runtime verification requires Redis. |

## Registration and Lifecycle

`cronx` registers the `CRON` service from package init. In ordinary applications, importing the package and calling `bootstrap.StartUp()` is enough:

```go
package order

import (
    "context"
    "time"

    "github.com/jom-io/gorig/cronx"
    "github.com/jom-io/gorig/utils/logger"
    "go.uber.org/zap"
)

func init() {
    cronx.AddCronTask("0 */10 * * * *", syncExpiredOrders, 2*time.Minute)
}

func syncExpiredOrders(ctx context.Context) {
    logger.Info(ctx, "expired order sync started")
    count, err := cancelExpiredOrders(ctx)
    if err != nil {
        logger.Error(ctx, "expired order sync failed", zap.Error(err))
        return
    }
    logger.Info(ctx, "expired order sync finished", zap.Int64("count", count))
}
```

Manual lifecycle is useful only in tests or custom hosts:

```go
_ = cronx.Startup("CRON", "")
// ...
_ = cronx.Shutdown("CRON", context.Background())
```

Do not depend on startup ordering relative to unrelated services unless the resolved framework version provides explicit ordering.

## Interval Tasks

Use `AddEveryTask` for simple fixed intervals when the target Gorig version includes commit `92c28b5` or an equivalent fix. Older inspected versions recursively locked the task mutex and must not use this helper.

```go
func init() {
    cronx.AddEveryTask(5*time.Minute, refreshCacheWarmup, 30*time.Second)
}

func refreshCacheWarmup(ctx context.Context) {
    logger.Info(ctx, "cache warmup started")
    if err := warmupHotKeys(ctx); err != nil {
        logger.Error(ctx, "cache warmup failed", zap.Error(err))
    }
}
```

Rules:

- Reject intervals at or below one millisecond; the framework logs and skips them.
- Use `AddCronTask` directly when the schedule needs wall-clock alignment.
- Verify `AddEveryTask` returns promptly and the task executes at least once in the target version.
- Keep the same timeout and cancellation rules as `AddCronTask`.

## Timeout and Cancellation

When a timeout is supplied, the wrapper creates a context with that timeout. Long tasks must observe `ctx.Done()`:

```go
cronx.AddCronTask("@every 30s", func(ctx context.Context) {
    select {
    case <-ctx.Done():
        logger.Warn(ctx, "job canceled before completion", zap.Error(ctx.Err()))
        return
    case item := <-work:
        process(ctx, item)
    }
}, 5*time.Second)
```

The framework logs timeout expiration. It does not forcibly stop goroutines that ignore the context, so every long-running job must check cancellation.

## Persistent Delay Tasks

Use persistent delay tasks only when delayed work must survive process restarts and Redis is available. The inspected implementation stores task metadata and JSON payloads in Redis under the `gorig:cronx:persist:*` namespace, claims due tasks with Redis scripts, and keeps completed or failed task records for 24 hours.

Persistent task APIs require Gorig commit `0af68e8` or a later equivalent implementation.

```go
type OrderDelayPayload struct {
    OrderID int64 `json:"order_id"`
}

func (OrderDelayPayload) PersistPayload() {}

func handleOrderDelay(ctx context.Context, payload OrderDelayPayload) error {
    logger.Info(ctx, "delayed order task", zap.Int64("order_id", payload.OrderID))
    return processDelayedOrder(ctx, payload.OrderID)
}

func init() {
    if err := cronx.RegisterPersistTask(handleOrderDelay); err != nil {
        logger.Error(nil, "register persistent cron task failed", zap.Error(err))
    }
}

func scheduleOrderDelay(orderID int64) (string, error) {
    return cronx.AddPersistDelayTask(
        5*time.Minute,
        handleOrderDelay,
        OrderDelayPayload{OrderID: orderID},
        30*time.Second,
    )
}
```

For absolute run times:

```go
taskID, err := cronx.AddPersistOnceTask(
    time.Now().Add(time.Hour),
    handleOrderDelay,
    OrderDelayPayload{OrderID: orderID},
    30*time.Second,
)
```

Rules:

- Register every persistent handler during application startup with `RegisterPersistTask`.
- Handlers must be named functions. Closures and anonymous functions are rejected because Redis stores only the handler name.
- Payload types must implement `PersistPayload` and must be JSON serializable. Keep JSON tags stable across deployments.
- Redis must be configured and reachable before scheduling persistent tasks.
- Use ordinary `AddDelayTask` or `AddOnceTask` when restart persistence is not required.
- Treat task handlers as at-least-once work. Make handlers idempotent because a task can be recovered from the processing set after a worker lease expires.
- Use task IDs returned by `AddPersistDelayTask` or `AddPersistOnceTask` for logs and operational troubleshooting.

Redis configuration follows the same keys used by cache and Redis messaging:

```yaml
redis:
  addr: 127.0.0.1:6379
  password: ""
  db: 0
```

Environment overrides:

- `GORIG_REDIS_ADDR`
- `GORIG_REDIS_PASSWORD`
- `GORIG_REDIS_DB`

Do not commit real Redis passwords or shared production addresses in examples or fixtures.

## Panic Recovery

`AddCronTask`, `AddDelayTask`, and `AddOnceTask` wrap handlers with panic recovery. A panic is logged and sent through the configured DingTalk panic notifier. Treat recovery as a safety net, not control flow.

Rules:

- Keep job handlers idempotent.
- Log useful identifiers before risky work.
- Avoid panics for ordinary business failures; return/log structured errors instead.
- Never use `fmt.Println` for cron diagnostics.

## Deduplication

Duplicate detection uses the pair of schedule spec and function name. Register a stable named function when deduplication matters:

```go
func init() {
    cronx.AddCronTask("@every 1m", syncInventory)
    cronx.AddCronTask("@every 1m", syncInventory) // ignored as duplicate
}

func syncInventory(ctx context.Context) {}
```

Anonymous closures with different generated names may not deduplicate the way a reader expects.

## Verification Checklist

- Compile against the target project's resolved Gorig version.
- Run a short deterministic job and assert execution count.
- Register the same named function twice and verify duplicate registration does not double executions.
- Verify timeout by asserting the handler observes `ctx.Done()`.
- Verify panic recovery does not terminate the test process.
- Verify delay or once jobs run exactly once.
- Call shutdown and assert no verification process is left running.
- Verify `AddEveryTask` returns promptly, does not deadlock during registration, and executes on the expected interval.
- Verify persistent task registration rejects anonymous handlers.
- Verify persistent task scheduling rejects unregistered handlers and non-JSON payloads.
- Verify persistent delay/once runtime behavior only with disposable or explicitly supplied Redis: schedule a task, start or restart the worker, assert the payload is handled, and clean up `gorig:cronx:persist:*` keys.
