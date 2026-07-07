# Messaging

Use this reference when a task needs in-process pub/sub, Redis-backed messaging, sequential subscribers, retries, dead letter queues, replay, unsubscribe behavior, or message-to-SSE composition.

Always inspect the target project's resolved Gorig source first. The examples below reflect the locally inspected Gorig `master` commit `35bbefb`.

## Broker Choice

Use `github.com/jom-io/gorig/mid/messagex`.

```go
localBroker := messagex.Ins(messagex.Local)
redisBroker := messagex.Ins(messagex.Redis)
```

Supported in the inspected baseline:

| Broker | Status | Notes |
|---|---|---|
| `messagex.Local` | verified | Process-local pub/sub. Good for in-process events and tests. |
| `messagex.Redis` | source-verified | Uses Redis cache/list storage. Requires configured Redis before runtime behavior is claimed. |
| `messagex.RabbitMQ` | unsupported | Enum exists, but no broker implementation is constructed. |

Do not silently switch to Redis. Redis messaging requires `redis.addr`, `redis.password`, and `redis.db` or the corresponding `GORIG_REDIS_*` environment variables.

## Publish and Subscribe

Concurrent subscribers receive messages independently. Handler calls run asynchronously for non-sequential subscriptions.

```go
broker := messagex.Ins(messagex.Local)

subID, err := broker.RegisterTopic("order.created", func(msg *messagex.Message) *errors.Error {
    orderID := msg.GetValueInt64("order_id")
    logger.Info(msg.Ctx, "order created event received", zap.Int64("order_id", orderID))
    return nil
})
if err != nil {
    return err
}
defer broker.UnRegisterTopic("order.created", subID)

broker.PublishNewMsg(ctx, "order.created", map[string]any{
    "order_id": id,
})
```

`PublishNewMsg` converts struct and map content to `map[string]interface{}` and lowercases content keys. Use the typed getters when consuming:

```go
msg.GetValue("name")
msg.GetValueStr("name")
msg.GetValueInt64("order_id")
msg.GetValueFloat64("amount")
```

## Sequential Consumption

Use `RegisterTopicSeq` when a subscriber must process messages one at a time in publish order.

```go
subID, err := broker.RegisterTopicSeq("order.created", func(msg *messagex.Message) *errors.Error {
    return rebuildProjection(msg.Ctx, msg.GetValueInt64("order_id"))
}, messagex.WithMaxRetry(3), messagex.WithRetryIntervals(500*time.Millisecond))
```

Sequential behavior is per subscriber. Multiple subscribers still receive their own copy of each message.

## Retry and DLQ

Sequential subscribers can retry failed messages. When retries are exhausted, the message is sent to the configured DLQ topic.

```go
subID, err := broker.RegisterTopicSeq(
    "order.project",
    handler,
    messagex.WithMaxRetry(2),
    messagex.WithRetryIntervals(100*time.Millisecond, time.Second),
    messagex.WithDLQTopic("order.project.dead"),
)
```

Local broker behavior:

- Retry is verified.
- Failed messages can be published to a DLQ topic.
- `ReplayDLQ` is not available because the local broker has no store; it returns `store not initialized for dlq replay`.

Redis broker behavior:

- Retry, delayed requeue, and replay use Redis storage.
- `ReplayDLQ(topic, limit)` requeues messages from `topic + ".dlq"` unless a custom DLQ topic was configured.
- Verify with disposable Redis before claiming replay behavior.

## Unsubscribe and Cleanup

Always keep the returned subscription ID and unregister when the subscriber is scoped to a test, lifecycle, or temporary workflow:

```go
subID, err := broker.RegisterTopic(topic, handler)
if err != nil {
    return err
}
defer broker.UnRegisterTopic(topic, subID)
```

Unsubscribe closes the subscriber channel and removes topic state when no subscribers remain. Do not publish to a topic from a goroutine that outlives its intended subscriber lifecycle unless that behavior is part of the design.

## Message to SSE Composition

For simple same-process streams, register a local topic subscriber inside the SSE handler and unregister it when the request context is done:

```go
func streamOrders(ctx *gin.Context) {
    subID, err := messagex.Ins(messagex.Local).RegisterTopic("order.updated", func(msg *messagex.Message) *errors.Error {
        if sendErr := ssex.SendOK(ctx, "order.updated", msg.Content); sendErr != nil {
            return errors.Sys(sendErr.Error())
        }
        return nil
    })
    if err != nil {
        _ = ssex.SendError(ctx, "order.updated", err.Error())
        return
    }
    defer messagex.Ins(messagex.Local).UnRegisterTopic("order.updated", subID)

    <-ctx.Request.Context().Done()
}
```

This pattern holds a request open. Use it only for SSE routes and handle send errors as disconnect signals. For cross-process events, use Redis messaging after Redis integration is verified.

## Verification Checklist

- Compile against the target project's resolved Gorig version.
- Verify local publish/consume for success payloads.
- Verify multiple subscribers each receive each message.
- Verify sequential subscribers preserve publish order.
- Verify retry count and retry ordering.
- Verify DLQ delivery for local broker or DLQ replay for Redis broker.
- Verify unsubscribe prevents further delivery.
- Verify Redis publish/consume, ordering, retry, DLQ, replay, and cleanup only against disposable or explicitly supplied Redis configuration.
- Record RabbitMQ as unsupported unless the target version adds a real implementation.
