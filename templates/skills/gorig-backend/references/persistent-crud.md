# Persistent CRUD Module

Use this reference when the user asks to add a business CRUD module, persistent resource, management capability, or storage-backed service.

CRUD is not inherently HTTP. Treat persistence and business behavior as the core capability. Add HTTP routes/controllers only when the user asks for an HTTP API, when the existing project exposes similar modules through HTTP, or when the delivery contract explicitly requires route-level smoke verification.

## Storage Selection

The verified persistent CRUD workflow currently supports only:

- MySQL through `domainx/dx`
- MongoDB through `domainx/dx`

Before implementation:

1. If the user explicitly specifies MySQL, use MySQL.
2. If the user explicitly specifies MongoDB or Mongo, use MongoDB.
3. If the user specifies another persistence backend such as PostgreSQL, SQLite, Redis, files, or an external API, state that the verified persistent CRUD workflow supports only MySQL and MongoDB, then ask whether to use one of those two or proceed as custom unverified work.
4. If the user does not specify storage, inspect the target project first:
   - Reuse the existing database kind when the project has clear existing models/configuration for only one of MySQL or MongoDB.
   - If both exist, ask which one this module should use.
   - If neither is clear, ask the user to choose MySQL or MongoDB before coding.

Do not silently default to MySQL or MongoDB when the project context does not make the choice obvious.

## Configuration Discovery and Setup

Persistent CRUD requires a matching database connection. Before writing code:

1. Inspect `_bin/local.yaml`, `_bin/dev.yaml`, `_bin/prod.yaml`, test config under `test/_bin/`, and existing model `DConfig()` values.
2. Determine whether the selected database key already exists:
   - MySQL connection names are configured under `Mysql.<name>`, and models return that same `<name>` from `DConfig()`.
   - MongoDB connection names are configured under `mongo.<name>`, and models return that same `<name>` from `DConfig()`.
3. If configuration is missing, ask the user whether to:
   - add non-secret skeleton keys to the environment YAML files, or
   - provide values through environment variables.
4. Never invent or commit real credentials. Prefer environment variables for passwords and private connection strings.

When the user explicitly runs or approves `gorig-cli create <module> --crud --db ...`, the generator adds an idempotent non-secret connection skeleton to `_bin/local.yaml`, `_bin/dev.yaml`, `_bin/prod.yaml`, and `test/_bin/local.yaml`. Existing connection blocks with the same name are preserved.

Gorig uses Viper with prefix `GORIG` and `.` -> `_` key replacement. For example:

- `Mysql.Main.Write.Host` can be overridden with `GORIG_MYSQL_MAIN_WRITE_HOST`
- `Mysql.Main.Write.Pass` can be overridden with `GORIG_MYSQL_MAIN_WRITE_PASS`
- `mongo.main.uri` can be overridden with `GORIG_MONGO_MAIN_URI`
- `mongo.main.auth.password` can be overridden with `GORIG_MONGO_MAIN_AUTH_PASSWORD`

### MySQL skeleton

Add this shape when the selected backend is MySQL and the project has no existing MySQL config. Keep secrets empty unless the user explicitly provides development credentials.

```yaml
Mysql:
  Main:
    GormInit: 1
    IsOpenReadDb: 0
    Write:
      Host: 127.0.0.1
      Port: 3306
      DataBase: demo_api
      User: root
      Pass: ""
      Charset: utf8mb4
      SetConnMaxLifetime: 60
      SetMaxIdleConns: 10
      SetMaxOpenConns: 100
```

Required model config:

```go
func (*D) DConfig() (domainx.ConType, string, string) {
    return domainx.Mysql, "Main", Table
}
```

### MongoDB skeleton

Add this shape when the selected backend is MongoDB and the project has no existing Mongo config. Keep credentials empty unless the user explicitly provides development credentials.

```yaml
mongo:
  main:
    uri: mongodb://127.0.0.1:27017
    db:
      name: demo_api
    auth:
      need: false
      source: admin
      user: ""
      password: ""
    retry:
      writes: true
      reads: true
    pool:
      max: 10
      min: 1
    conn:
      idle:
        time:
          max: 10
```

Required model config:

```go
func (*D) DConfig() (domainx.ConType, string, string) {
    return domainx.Mongo, "main", Table
}
```

If the user cannot provide a reachable database during implementation, generate and compile the code but report DB integration as skipped. Do not claim create/list/page/update/delete behavior is verified until the selected database is reachable.

## Core Module Layout

For a persistent business module, generate or maintain:

```text
domain/<module>/
├── service.go
├── dto.go
├── README.md
└── model/
    └── <module>.go
test/
└── <module>_test.go
```

Use this additional HTTP adapter only when HTTP is in scope:

```text
domain/<module>/
├── router.go
└── controller.go
doc/
└── <module>.md
```

Keep request/response DTOs in `dto.go`. Keep persistent data structures and `DConfig()` in `model/<module>.go`. Do not put response DTOs under `model/`.

## Service Capability

Services must expose the business CRUD behavior independently of HTTP:

- create
- get/info by ID
- list with optional filters
- page with optional filters
- update by ID
- delete by ID

Services must:

- Accept `context.Context` and propagate it into `dx` and logs.
- Validate required fields and supported enum/filter values.
- Return `utils/errors` errors.
- Use `utils/logger` structured logs.
- Guard empty update/delete conditions.
- Treat not-found and duplicate cases explicitly.

## Query and Pagination Safety

List and page behavior must be database-backed.

Rules:

- Use `dx.Page(page, size, lastID)` for paginated API responses. Do not call `Find()`, convert the full result to `List()`, and slice it in memory.
- Push optional filters into the `dx` query before `Find()` or `Page()`. Do not fetch all records and filter in Go.
- Push sort order into `Sort(...)`. Do not sort an unbounded in-memory slice for API responses.
- Use `Count`, `Sum`, `Exists`, and projection APIs when only aggregate or existence data is needed. Do not fetch full rows to count, sum, or check existence in Go.
- Put a conservative maximum page size in DTO validation or service validation when the project has no existing convention.
- For background jobs that must inspect many records, use restrictive matches plus `FindEach` or `AllEach`; do not load an entire table into memory.
- If a requirement cannot be expressed through `dx`, use a direct driver escape hatch with equivalent database-side filtering, pagination, and limits.

The only acceptable in-memory post-processing is bounded processing after the database already applied the main filter/page/limit, and it must not change pagination semantics.

## Optional HTTP Adapter

When HTTP is in scope, use clear resource routes unless the existing project has a stricter convention:

| Method | Path | Purpose |
|---|---|---|
| POST | `/<module>/create` | Create a record |
| GET | `/<module>/info?id=` | Load one record |
| GET | `/<module>/list` | List records with optional filters |
| GET | `/<module>/page` | Page records with optional filters |
| POST | `/<module>/update` | Update a record |
| DELETE | `/<module>/delete?id=` | Delete a record |

Controllers must:

- `defer apix.HandlePanic(ctx)`
- Bind body/query parameters with the resolved `apix` signatures.
- Return through `apix.HandleData` with the project's established business code shape.
- Keep transport logic only; call service functions for business behavior.

Model note: `dx.On[T].Complex()` embeds `domainx.Options`; do not add generic `CreatedAt`, `UpdatedAt`, or `DeletedAt` fields to `T`. Keep only business-specific timestamps in `T`, and map audit timestamps from `*domainx.Complex[T]` when a response DTO needs them.

## MySQL Model Pattern

Use MySQL when the user chooses MySQL or the project clearly uses MySQL for similar modules.

```go
package model

import "github.com/jom-io/gorig/domainx"

const Table = "order"

type D struct {
    Name   string `gorm:"column:name;type:varchar(128);not null;uniqueIndex:uk_name" json:"name"`
    Status string `gorm:"column:status;type:varchar(32);not null;index:idx_status" json:"status"`
}

func (*D) DConfig() (domainx.ConType, string, string) {
    return domainx.Mysql, "Main", Table
}
```

Confirm the database name from existing project config or user input. Do not invent production database names.

## MongoDB Model Pattern

Use MongoDB when the user chooses MongoDB or the project clearly uses MongoDB for similar modules.

```go
package model

import "github.com/jom-io/gorig/domainx"

const Table = "order"

type D struct {
    Name   string `bson:"name" json:"name"`
    Status string `bson:"status" json:"status"`
}

func (*D) DConfig() (domainx.ConType, string, string) {
    return domainx.Mongo, "main", Table
}
```

Confirm collection and database naming with existing project conventions or user input.

## Migration and Indexes

Register indexes in `service.go`:

```go
func init() {
    domainx.AutoMigrate(
        func() domainx.ConTable {
            return dx.On[model.D](context.Background()).Complex()
        },
        domainx.CtIdx(domainx.Unique, "name"),
        domainx.CtIdx(domainx.Idx, "status"),
    )
}
```

Pass bare field names to `CtIdx`; the framework handles its own field path mapping. Verify this against the resolved Gorig source before implementation.

## Standard Service Operations

Use `domainx/dx` for baseline CRUD:

```go
id, err := dx.On[model.D](ctx, &d).Save()
item, err := dx.On[model.D](ctx).WithID(id).Get()
list, err := dx.On[model.D](ctx).Eq("status", status).Sort("id").Find()
page, err := dx.On[model.D](ctx).Eq("status", status).Sort("id").Page(page, size, lastID)
err = dx.On[model.D](ctx).WithID(id).Updates(fields)
err = dx.On[model.D](ctx).WithID(id).Delete()
```

Check the exact `dx` signatures in the resolved project version before coding.

For API pagination, prefer the `Page` call above. Use `Find` only for intentionally bounded lists, such as small lookup sets or internal logic with a restrictive match.

In the verified Gorig implementation, omitted/`false` trailing booleans enable the normal zero-value check, so empty optional filters are skipped. Passing `true` disables that check and forces an empty/zero condition into the query. Do not use `value == ""` as the third argument for optional filters.

## Documentation

Always update:

- `domain/<module>/README.md`: module purpose, storage choice, indexes, service operations, tests, limitations.

When HTTP is in scope, also update:

- `doc/<module>.md`: public API contract, request/response examples, error cases.

## Verification

Always run compile-level checks:

```sh
go fmt ./...
go vet ./...
go build ./...
go test ./... -v
```

The generated test layout separates validation tests from live-database tests:

- `test/<module>_test.go` runs with ordinary `go test` and does not require a database.
- `test/init_<backend>_integration_test.go` starts the selected Gorig database service.
- `test/<module>_integration_test.go` exercises the real CRUD lifecycle.
- `test/_bin/local.yaml` is the normal database configuration source for tests because the test package runs with `test/` as its working directory.

After filling the local connection values or exporting the documented environment variables, run:

```sh
go test -tags=integration,mysql ./test/... -v
go test -tags=integration,mongo ./test/... -v
```

Run only the command for the selected backend. If both backends are intentionally configured, run both commands separately so failures identify the affected connection.

When the selected database is available, verify effect-level service behavior:

- create success
- duplicate/invalid create
- get/info success
- get/info not found
- list filter
- page filter
- update success
- update invalid/not found
- delete success
- delete not found

When HTTP is in scope, also verify route-level smoke checks and confirm generated API docs match actual routes and response shapes.

If MySQL or MongoDB is not available, do not claim integration verification. Report the missing connection/configuration and mark DB integration as skipped.
