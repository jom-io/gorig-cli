# Service Lifecycle

## Built-in Startup

Use one application entry point:

```go
func main() {
	bootstrap.StartUp()
}
```

In the verified baseline, `bootstrap.StartUp()` registers the built-in HTTP service, prints registered routes, and calls `serv.Running()`.

Do not also register an application-specific service whose `Startup` and `Shutdown` are `httpx.Startup` and `httpx.Shutdown`; that creates duplicate lifecycle entries for one HTTP server.

## Registration Through Imports

Gorig projects commonly register routes, migrations, scheduled tasks, and services from package `init()` functions. Entry points use explicit blank imports to activate the intended packages:

```go
import _ "example.com/demo/domain"
```

Keep the import graph visible. Do not add a component import merely to make a package compile; every blank import changes application startup behavior.

## Custom Service

Register a distinct lifecycle component only when it owns a distinct resource:

```go
err := serv.RegisterService(serv.Service{
	Code:     "WORKER",
	Startup:  workerStartup,
	Shutdown: workerShutdown,
})
```

Requirements:

- Use a unique stable code.
- Return startup failures.
- Honor the shutdown context.
- Make shutdown idempotent.
- Do not rely on service map iteration order.

## Graceful Shutdown

The verified baseline waits for `os.Interrupt`, then gives registered services a five-second shutdown context. Test graceful shutdown with `SIGINT` and require the process to exit successfully.

Do not claim `SIGTERM` support without checking the resolved version; signal handling is version-specific.
