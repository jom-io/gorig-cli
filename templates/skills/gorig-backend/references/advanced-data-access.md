# Advanced Data Access

Use this reference when a task goes beyond baseline CRUD and needs complex filters, aggregate reads, projections, batch scans, indexes, direct database access, or transaction boundaries.

Always inspect the target project's resolved Gorig source first. The examples below reflect the locally inspected Gorig `master` commit `35bbefb`.

## Preferred API

Prefer `github.com/jom-io/gorig/domainx/dx` for supported MySQL and MongoDB access.

Use legacy `domainx` package functions only when:

- the target project already uses them consistently,
- the needed behavior is not exposed by `dx`, or
- version inspection proves the target's `dx` facade lacks the method.

When using legacy calls, keep the same guards as `dx`: update and delete operations must have a non-zero ID or a non-empty match list.

## Optional Filter Semantics

`Eq`, `Like`, `Gt`, `In`, and related methods accept optional `ignore ...bool`.

In the inspected version, `ignore=true` means "ignore the empty-value check", so the zero or empty value is forced into the condition. For ordinary optional request filters, omit the boolean.

```go
q := dx.On[model.D](ctx).
    Like("name", req.Name).     // empty req.Name is skipped by the framework
    Eq("status", req.Status).   // empty req.Status is skipped by the framework
    Sort("id")
```

Use `true` only when zero is an intentional filter value:

```go
q := dx.On[model.D](ctx).Eq("retry_count", 0, true)
```

## Complex Filters

Common comparison and set operations:

```go
q := dx.On[model.D](ctx).
    Eq("tenant_id", tenantID).
    Ne("status", "deleted").
    Gte("created_at", startAt).
    Lt("created_at", endAt).
    Like("name", keyword).
    In("type", []string{"standard", "premium"}).
    NotIn("status", []string{"archived", "blocked"}).
    NEmpty("external_id")
```

Array field operations:

```go
q := dx.On[model.D](ctx).
    Has("tags", "hot").
    HasAny("tags", []string{"vip", "trial"}).
    HasAll("flags", []string{"paid", "verified"})
```

MongoDB geo-spatial helpers:

```go
nearByLatLng := dx.On[model.D](ctx).Near("lat", "lng", lat, lng, 3000)
nearByLocation := dx.On[model.D](ctx).NearLoc("location", lat, lng, 3000)
```

Verify indexes and backend behavior before using geo queries in production. MySQL and MongoDB differ in supported geo field shapes and index requirements.

## Dynamic Conditions

When building conditions from loops or composable policy blocks, use `domainx.NewMatches()` and `AddMatches`.

```go
matches := domainx.NewMatches().
    Eq("tenant_id", tenantID).
    Eq("status", req.Status).
    Gte("score", req.MinScore, req.MinScore == 0)

for _, tag := range req.Tags {
    matches.Has("tags", tag)
}

list, err := dx.On[model.D](ctx).
    AddMatches(matches).
    Sort("id").
    Find()
```

Be careful with `ignore=true` in dynamic builders. The example above forces `MinScore=0` only if the request explicitly treats zero as a valid minimum. Omit the third argument when an empty or zero request field should be skipped.

## Sorting and Projection

```go
items, err := dx.On[model.D](ctx).
    Eq("tenant_id", tenantID).
    Select("id", "name", "status", "created_at").
    Omit("secret_note").
    Sort("created_at", true). // true means ascending
    Find()
```

`Sort("field")` is descending by default. Projection is useful for large records, but verify backend-specific field names:

- MySQL fields normally match `gorm:"column:<name>"`.
- MongoDB fields normally match `bson:"<name>"`.
- Do not project sensitive fields back into API responses just because storage returns them.

## Reads, Aggregates, and Existence Checks

```go
one, err := dx.On[model.D](ctx).WithID(id).Get()
exists, err := dx.On[model.D](ctx).Eq("code", code).Exists()
count, err := dx.On[model.D](ctx).Eq("status", "active").Count()
sum, err := dx.On[model.D](ctx).Eq("tenant_id", tenantID).Sum("amount")
```

Use `Get` only when a single record is expected. Use `Exists` for uniqueness checks instead of fetching full records when the value is not needed.

## Memory-Safe Query Processing

Query work must be pushed down to the database or handled through bounded framework iteration.

Do not:

- fetch all rows with `Find()` and then filter in Go;
- fetch all rows with `Find()` and then sort in Go for an API response;
- fetch all rows with `Find()` and then slice a page in Go;
- fetch all rows to count, sum, or check existence;
- scan an entire table in a background task without a restrictive match or operational reason.

Use:

- `Eq`, `Like`, `Gt/Gte/Lt/Lte`, `In`, `AddMatches`, and backend-specific filters before reading;
- `Sort` before `Find` or `Page`;
- `Page(page, size, lastID)` for API pagination;
- `Select` or `Omit` for large records;
- `Count`, `Sum`, and `Exists` for aggregate/existence checks;
- `FindEach` or `AllEach` for bounded batch processing when a job must touch many records.

If `dx` cannot express the needed query, use a direct driver with database-side `WHERE`/filter, `ORDER BY`, `LIMIT`, cursor, aggregation pipeline, or equivalent backend mechanism. The direct-driver path must include the same tenant/scope/time-range guards that a `dx` query would have.

In-memory processing is acceptable only after the database has already applied the main filter and bound the result size.

## Pagination and Batch Scans

Cursor-aware paging:

```go
resp, err := dx.On[model.D](ctx).
    Eq("tenant_id", tenantID).
    Sort("id").
    Page(req.Page, req.Size, req.LastID)
```

Safe full scans:

```go
err := dx.On[model.D](ctx).
    Eq("tenant_id", tenantID).
    AllEach(func(item *domainx.Complex[model.D]) *errors.Error {
        // Process one item. Keep the handler idempotent.
        return nil
    })
```

`AllEach` pages by ID in batches of 1000 in the inspected implementation. Always include a restrictive match for tenant, scope, or job boundary. Do not use it as an unbounded production table scan without an operational reason.

## Writes and Guards

```go
id, err := dx.On[model.D](ctx, &d).Save()

err = dx.On[model.D](ctx).WithID(id).Updates(map[string]interface{}{
    "status":     "done",
    "updated_by": actorID,
})

err = dx.On[model.D](ctx).
    Eq("tenant_id", tenantID).
    Eq("expired", true, true).
    Delete()
```

`Update`, `Updates`, `Delete`, `Get`, `Find`, `FindEach`, and `AllEach` guard against missing IDs or empty match lists in the inspected `dx` implementation. Preserve this behavior. Do not bypass it with direct drivers unless the replacement has an equal or stronger safety condition.

## Migrations and Indexes

Register indexes from `service.go` using `domainx.AutoMigrate`.

```go
func init() {
    domainx.AutoMigrate(
        func() domainx.ConTable {
            return dx.On[model.D](context.Background()).Complex()
        },
        domainx.CtIdx(domainx.Unique, "tenant_id", "code"),
        domainx.CtIdx(domainx.Idx, "tenant_id", "status", "created_at"),
        domainx.CtIdx(domainx.Spatial2D, "lat", "lng"),
    )
}
```

Pass bare storage field names. Verify generated indexes against the selected backend:

- MySQL uses GORM migration plus explicit index creation in the inspected source.
- MongoDB maps fields through its own query builder and index implementation.
- Compound and unique index names must be stable enough for repeated migration runs.
- Geo-spatial indexes are backend-specific and must be proven with integration tests.

## Direct Driver Escape Hatches

Use direct database handles only when `dx` cannot express the required behavior, such as a backend-specific lock, transaction, aggregation pipeline, or raw SQL optimization.

Available inspected escape hatches:

```go
con := dx.On[model.D](ctx).Complex().GetCon()
raw, err := con.MustGetDB()
if err != nil {
    return err
}
```

For MySQL, `raw` is expected to be `*gorm.DB`. For MongoDB, `raw` is expected to be `*qmgo.Client`.

Project-level connection helpers also exist:

```go
mysqlDB := domainx.UseDbConn("Main")
mongoClient := domainx.UseMongoDbConn("main")
```

Rules for escape hatches:

- Keep direct-driver code inside the service or a small repository helper.
- Require explicit type assertions and nil checks.
- Keep tenant, ID, and match guards visible next to raw queries.
- Add integration tests for the exact backend path.
- Do not hide raw SQL or Mongo pipelines behind generic helper names.

## Transactions

The inspected `dx` facade does not expose a generic transaction wrapper. For MySQL-only work, use the direct `*gorm.DB` transaction API after verifying the target version:

```go
raw, err := dx.On[model.D](ctx).Complex().GetCon().MustGetDB()
if err != nil {
    return err
}

db, ok := raw.(*gorm.DB)
if !ok || db == nil {
    return errors.Sys("mysql connection is not available")
}

if txErr := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
    return tx.Table(model.Table).Where("id = ?", id).Update("status", "done").Error
}); txErr != nil {
    return errors.Sys(txErr.Error())
}
```

MongoDB transaction behavior is not covered by the current verified skill baseline. Inspect the resolved `qmgo` version and run a MongoDB integration test before advertising Mongo transaction support.

## Verification Checklist

- Compile the affected package against the resolved Gorig version.
- Run ordinary tests without external services.
- Run tagged or container-backed integration tests for MySQL and MongoDB paths.
- Verify optional filters with empty values and intentional zero values.
- Verify sorting, projection, pagination, count/sum, update/delete guards, and index creation.
- Record unsupported backend behavior and skipped checks explicitly.
