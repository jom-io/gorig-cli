# Server-Sent Events

Use this reference when a task needs SSE streaming, event/error payloads, GET-only stream routes, disconnect handling, or message-to-SSE composition.

Always inspect the target project's resolved Gorig source first. The examples below reflect the locally inspected Gorig `master` commit `35bbefb`.

## Route Setup

Use `github.com/jom-io/gorig/httpx/ssex`.

```go
func init() {
    httpx.RegisterRouter(func(root *gin.RouterGroup) {
        root.GET("/orders/events", ssex.Mid(), streamOrderEvents)
    })
}
```

`ssex.Mid()`:

- allows only `GET`,
- returns HTTP `405` JSON for non-GET requests,
- sets `Content-Type: text/event-stream`,
- sets `Cache-Control: no-cache`,
- sets `Connection: keep-alive`,
- sets `Access-Control-Allow-Origin: *`,
- flushes headers before calling the handler.

## Sending Events

```go
func streamOrderEvents(ctx *gin.Context) {
    if err := ssex.SendOK(ctx, "ready", map[string]any{"ok": true}); err != nil {
        return
    }
    if err := ssex.SendError(ctx, "warning", "temporary degraded state"); err != nil {
        return
    }
}
```

The wire format is:

```text
event: ready
data: {"status":"ok","data":{"ok":true}}
```

Error events use:

```json
{"status":"error","message":"temporary degraded state"}
```

`SendOK` and `SendError` return ordinary Go errors from JSON encoding or response writing. Treat a write error as a disconnect or broken stream and stop sending.

## Long-Lived Streams

For long-lived streams, block on either application events or request cancellation:

```go
func stream(ctx *gin.Context) {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Request.Context().Done():
            return
        case <-ticker.C:
            if err := ssex.SendOK(ctx, "heartbeat", map[string]any{"ts": time.Now().Unix()}); err != nil {
                return
            }
        }
    }
}
```

Rules:

- SSE endpoints must be `GET`.
- Do not call `apix.HandleData` after starting an SSE stream.
- Do not write unrelated JSON responses to the same stream.
- Always watch `ctx.Request.Context().Done()`.
- Keep per-connection goroutines bounded and unregister subscribers on disconnect.

## Message to SSE Composition

When the event source is `messagex`, register a subscriber for the connection and unregister it on exit:

```go
func streamOrderUpdates(ctx *gin.Context) {
    broker := messagex.Ins(messagex.Local)
    subID, err := broker.RegisterTopic("order.updated", func(msg *messagex.Message) *errors.Error {
        if sendErr := ssex.SendOK(ctx, "order.updated", msg.Content); sendErr != nil {
            return errors.Sys(sendErr.Error())
        }
        return nil
    })
    if err != nil {
        _ = ssex.SendError(ctx, "order.updated", err.Error())
        return
    }
    defer broker.UnRegisterTopic("order.updated", subID)

    <-ctx.Request.Context().Done()
}
```

This simple pattern is appropriate for low-volume same-process streams. For high fan-out, backpressure, or cross-process delivery, design a bounded stream loop and verify Redis-backed messaging behavior.

## Verification Checklist

- Compile against the target project's resolved Gorig version.
- Verify GET responses include SSE headers.
- Verify non-GET requests return HTTP 405 with the framework error JSON.
- Verify `SendOK` writes the expected `event:` and JSON `status:"ok"` payload.
- Verify `SendError` writes `status:"error"` and message payload.
- Verify long-lived handlers exit on `ctx.Request.Context().Done()`.
- Verify write errors or disconnects stop the loop and unregister any message subscribers.
- For message-to-SSE, verify publish -> receive -> SSE event output and cleanup.
