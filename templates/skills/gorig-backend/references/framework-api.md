# Verified Framework API Baseline

Use these snippets only after checking the target project's resolved Gorig version. They reflect the locally inspected `master` baseline and intentionally avoid incomplete scenarios that belong to later roadmap phases.

## Application Entry

`bootstrap.StartUp()` registers the built-in HTTP service. Do not register the same `httpx.Startup` lifecycle a second time unless the resolved framework version or a distinct server requires it.

```go
package main

import "github.com/jom-io/gorig/bootstrap"

import _ "example/domain"

func main() {
	bootstrap.StartUp()
}
```

Import component packages for their documented `init()` registration only when the application uses them.

## Route and Controller

The inspected `RegisterRouter` callback receives `*gin.RouterGroup`.

```go
func init() {
	httpx.RegisterRouter(func(root *gin.RouterGroup) {
		group := root.Group("/hello")
		group.GET("", getHello)
	})
}

func getHello(ctx *gin.Context) {
	defer apix.HandlePanic(ctx)
	name, err := apix.GetParamType[string](ctx, "name", apix.NotForce, "world")
	if err != nil {
		return
	}
	result := map[string]string{"message": "hello " + name}
	apix.HandleData(ctx, consts.CurdSelectFailCode, result, nil)
}
```

Do not use obsolete examples that call typed parameter getters without `Force`/`NotForce`, discard their returned error, or call `HandleData` without a business error code.

## Custom Lifecycle Service

```go
err := serv.RegisterService(serv.Service{
	Code:     "WORKER",
	Startup:  workerStartup,
	Shutdown: workerShutdown,
})
if err != nil {
	sys.Exit(err)
}
```

Do not rely on relative startup order among registered services unless the target version provides ordering guarantees.

## Model and dx

```go
type Order struct {
	UserID int64  `bson:"user_id" json:"user_id"`
	Status string `bson:"status" json:"status"`
}

func (*Order) DConfig() (domainx.ConType, string, string) {
	return domainx.Mongo, "main", "order"
}

func init() {
	domainx.AutoMigrate(
		func() domainx.ConTable {
			return dx.On[Order](context.Background()).Complex()
		},
		domainx.CtIdx(domainx.Idx, "user_id", "status"),
	)
}
```

Common operations in the inspected version:

```go
id, err := dx.On(ctx, &order).Save()
one, err := dx.On[Order](ctx).WithID(id).Get()
list, err := dx.On[Order](ctx).Eq("status", status).Sort("id").Find()
err = dx.On[Order](ctx).WithID(id).Update("status", "done")
err = dx.On[Order](ctx).WithID(id).Delete()
```

Update and delete operations intentionally reject an empty ID/filter. Preserve those guards.

The optional boolean on `Eq`, `Like`, and related methods means "ignore the framework's empty-value check." `true` therefore forces zero/empty values into the query; it does not skip the filter. Omit the boolean for ordinary optional filters.

## Cache

```go
memory := cache.New[Order](cache.Memory, time.Minute, time.Minute)
jsonFile := cache.New[Order](cache.JSON, "orders")
sqlite := cache.New[Order](cache.Sqlite, "orders")
redis := cache.New[Order](cache.Redis)
```

Test local backends independently. Require explicit Redis configuration before claiming Redis behavior is verified.

## Scheduled Task

```go
cronx.AddCronTask("0 */5 * * * *", func(ctx context.Context) {
	logger.Info(ctx, "scheduled sync")
}, 30*time.Second)
```

Do not use `AddEveryTask` against the inspected local baseline until its locking behavior is fixed and tested.

## Messaging

```go
broker := messagex.Ins(messagex.Local)
subID, err := broker.RegisterTopic("order.created", func(msg *messagex.Message) *errors.Error {
	return nil
})
if err == nil {
	defer broker.UnRegisterTopic("order.created", subID)
}
broker.PublishNewMsg(ctx, "order.created", map[string]any{"order_id": id})
```

Use `messagex.Redis` only with configured Redis integration. RabbitMQ is unsupported in the inspected baseline.

## SSE

```go
httpx.RegisterRouter(func(root *gin.RouterGroup) {
	root.GET("/events", ssex.Mid(), func(ctx *gin.Context) {
		_ = ssex.SendOK(ctx, "update", map[string]any{"ready": true})
	})
})
```

Handle send errors and client disconnects in long-lived streams.

## Authentication Boundary

`httpx.SignDef()` uses the memory-backed token manager. Verify generation, expiry, refresh, revocation, and persistence for the application before production use.

Do not use `httpx.SignRedis()` against a version whose `tokenx.Redis` manager is unimplemented.

## Logging

```go
logger.Info(ctx, "order created", zap.Int64("order_id", id))
logger.Error(ctx, "save order failed", zap.Error(err))
```

Pass request context through every layer. Use `logger.NewCtx()` only when there is no request context, such as an independent background job.
