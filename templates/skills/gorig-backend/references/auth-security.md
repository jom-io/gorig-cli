# Authentication and Security

Use this reference when the request involves login, logout, protected routes, token refresh, user identity, roles, access filtering, CORS, debounce/rate protection, request signing, secrets, or sensitive logs.

Always inspect the target project's resolved Gorig source first. Redis token manager is implemented in the current source line and is expected to be available in releases that include `mid/tokenx/redis.manager.go` such as the planned `v0.0.53+`. Local `master` commit `4dcf601` has a real Redis integration test in `test/tokenx_redis_test.go`; that test passes when Redis is configured and skips with `redis is not configured` when the environment is missing Redis.

## Business Workflow

Translate business language before coding:

- "Login" means a route verifies credentials, creates a token, records it through the selected token manager, and returns only non-sensitive user data.
- "Only logged-in users can access" means protected routes must use token middleware and service logic must read the injected user context, not trust a request body user id.
- "Admin only" or "role-based access" means `SignUserDef` with `userInfo` filters when the required attributes are inside the token claims; use service-layer authorization when the rule depends on live database state.
- "Logout" means the current token is destroyed and the same token no longer accesses protected routes.
- "Refresh token" means the old token is eligible for refresh, a new token is generated, the manager swaps old to new, and the old token stops working.

For a material auth change, present this confirmation plan before editing:

```text
Business goal:
- <who can do what, and what logout/expiry should mean>

Identity model:
- User id source:
- Token claims/userInfo:
- Role or attribute rules:
- Whether live database checks are required:

Recommended design:
- Token manager:
- Protected routes:
- Forbidden behavior:
- Logout/refresh behavior:

Security boundary:
- Secret source:
- Sensitive fields excluded from logs/responses:
- Redis-token status for this Gorig version:

Verification:
- Login -> protected route -> logout:
- Missing/malformed/expired/refreshed/revoked/forbidden token:
- User context and trace context:
```

## Token Manager

Memory token is the verified default for local and simple single-process flows:

```go
svc := tokenx.Get(tokenx.Jwt, tokenx.Memory)
token, err := svc.Manager.GenerateAndRecord(ctx, userID, userInfo, 3600)
```

Important behavior:

- `Generator.Generate(userID, userInfo, expireAt)` uses `expireAt` as seconds from now in the inspected source.
- `Manager.GenerateAndRecord` may reuse an existing token for the same user id and same derived user type.
- `Manager.Clean(userID)` revokes all tokens for the user.
- `Manager.Destroy(token)` revokes one token.
- Memory token state is process-local plus `./tokens.json` persistence in inspected versions; do not present it as cross-instance session storage.
- In inspected versions, `Destroy(token)` deletes from memory but does not itself force an immediate `tokens.json` rewrite. Verify logout/revocation in the target app, especially for the last active token in a process.
- Do not log raw tokens or full userInfo when it may include phone numbers, emails, roles not intended for clients, or other sensitive data.

Redis token rules:

- Confirm the target version includes `mid/tokenx/redis.manager.go` or an equivalent Redis manager implementation before using `httpx.SignRedis()` or `SignUserRedis()`.
- For `v0.0.53+` or any project resolved to source containing the Redis manager, treat Redis token as an implemented and usable capability.
- Check whether the target source includes `test/tokenx_redis_test.go` or equivalent integration coverage.
- When Redis is configured, run `go test ./test -run TestRedisTokenManager -v` or the target project's equivalent as the runtime integration check.
- When Redis is not configured and the test skips, report the missing Redis configuration and tell the user how to provide it; do not describe Redis token as unavailable or switch to memory unless the user accepts the single-process tradeoff.
- The master integration test covers `GenerateAndRecord`, same-user/same-`userInfo` token reuse, old-token cleanup when userInfo changes, `Clean(userID)`, `Refresh`, `Destroy`, and `IsEffective`.
- Never silently switch a user-requested Redis session design to memory token without explaining the restart/cross-process behavior difference.

## Middleware

Use memory middleware for simple local single-process flows. Use Redis middleware when the business needs Redis-backed token state and the target version includes the Redis token manager:

```go
group := root.Group("/account")
group.GET("/me", httpx.SignDef(), me)
group.GET("/admin", httpx.SignUserDef(map[string]interface{}{"role": "admin"}), admin)
```

Middleware expectations:

- Missing `Authorization` header returns a token parameter error.
- Header must be `Bearer <token>` and token length must pass the framework check.
- Valid token sets `consts.TokenKey`, user id via `apix.SetUserID`, and userInfo via `apix.SetUserInfo`.
- User id is also inserted into request context through `consts.UserIDKey`, so logger fields can include it when the same context is propagated.
- `SignUserDef` filters against JWT `UserInfo`; it does not query the database.
- A mismatched filter returns forbidden; use service-level checks for data-owner rules such as "only the order owner can update this order".

## Minimal Login Flow

Keep the first slice small:

```text
POST /auth/login
- verify demo or real credentials in service
- generate and record token
- return token plus public user profile

GET /auth/me
- protected with SignDef
- read user id and userInfo from apix

POST /auth/logout
- protected with SignDef
- destroy current token from httpx.GetToken
```

When no user store exists yet, use an explicit demo account only in local fixtures and label it as non-production.

## Refresh Flow

Use the manager directly and test both old and new tokens:

```go
oldToken := httpx.GetToken(ctx)
if !svc.Manager.IsMeetRefresh(oldToken) {
    response.ErrorTokenRefreshFail(ctx)
    return
}
newToken, err := svc.Generator.Generate(userID, userInfo, refreshSeconds)
if err != nil || !svc.Manager.Refresh(oldToken, newToken) {
    response.ErrorTokenRefreshFail(ctx)
    return
}
```

After refresh:

- old token must fail protected routes;
- new token must pass protected routes;
- user context must still be present.

## CORS

The built-in HTTP service installs `httpx.CORS()` globally in inspected source. For direct router tests or custom servers, attach it explicitly.

Verify:

- `OPTIONS` preflight returns HTTP 204;
- `Access-Control-Allow-Origin` echoes the request origin when present;
- `Access-Control-Allow-Headers` includes `Authorization` and any custom allowed headers;
- credentials are allowed only when this matches the business security model.

Use `httpx.SetOtherAllowHeaders("X-Tenant-ID")` only for explicit header requirements.

## Debounce and Rate Protection

The built-in HTTP service installs `httpx.Debounce(200 * time.Millisecond)` in inspected source. For route-level behavior tests, attach `httpx.Debounce(duration)` directly.

Behavior:

- The key is path plus query for GET requests.
- If a valid token is present, the key uses the token's user id.
- Otherwise, the key uses client IP.
- A repeated request within the duration returns HTTP 429.
- `httpx.DebouceAw(path...)` whitelists exact paths. Preserve the misspelling because it is the inspected API name.
- `httpx.DebounceDisable()` disables the global debounce switch for the process; use it cautiously in tests because it affects later tests.

## Request Signing Boundary

Do not invent request-signature support. If the business asks for "API signature" or "signed callbacks":

1. Search the target source for a verified signing middleware/helper.
2. If absent, propose a custom middleware with nonce, timestamp, body hash, shared secret, replay window, and tests.
3. Require explicit confirmation because this is security-sensitive custom behavior.

## Secret and Log Rules

- Read JWT secrets from configuration or environment, never from hard-coded examples.
- Use placeholder values such as `change-me-local-jwt-key`; never include real tokens, passwords, webhook URLs, or production hosts in fixtures.
- Do not log `Authorization`, raw token strings, passwords, refresh secrets, or full outbound request bodies containing credentials.
- Existing middleware may log headers; if protecting sensitive routes, inspect and adjust logging behavior before production use.
- The inspected memory `Destroy` logs the raw token. Treat this as a production hardening item if framework behavior is unchanged in the target version.

## Verification Checklist

Tests must cover:

- valid token reaches protected route;
- missing header fails;
- malformed `Authorization` fails;
- expired JWT is tested through `IsNotExpired`/`IsEffective`, and protected-route behavior is tested for manager-expired or unrecorded tokens according to the resolved version;
- refreshed token swaps old to new;
- revoked/logout token fails;
- forbidden role or attribute fails;
- middleware writes `apix.GetUserID`, `apix.GetUserInfo`, request-context user id, and preserves trace context;
- CORS preflight and allowed headers;
- debounce repeated request and whitelisted path;
- examples and fixtures contain no real secrets.
