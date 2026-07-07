# Outbound HTTP

Use this reference when the backend must call another HTTP service, fetch remote data, post forms, send JSON/XML, forward headers, propagate context, enforce timeouts, handle bad responses, or fetch images.

Always inspect the target project's resolved `httpx/http.go` before coding. The inspected API is convenient but not a complete production client abstraction.

## Business Workflow

Translate business language before choosing helpers:

- "Call the partner API" means define the request, timeout, retry/idempotency expectation, headers, response mapping, and business error shown to callers.
- "Forward the user's token" means use context-aware helpers only when forwarding `Authorization` is intended and safe.
- "Do not hang the request" means use a per-call timeout and test it against a slow local server.
- "Bad upstream response" means decide whether the caller sees a retryable error, fallback data, or a business failure.
- "Fetch an image" means verify content type, size limits, and allowed hosts if the URL comes from users.

For material outbound changes, confirm:

```text
Business goal:
- <external effect or data needed>

Upstream contract:
- Method/path:
- Request body/query:
- Headers:
- Expected success response:
- Bad response behavior:
- Timeout:

Security:
- Which user headers are forwarded:
- Which secrets/config keys are required:
- URL allowlist or SSRF boundary:

Verification:
- Local httptest server cases:
- Timeout case:
- Bad JSON/XML/status case:
```

## Supported Helpers

The inspected source exposes:

```go
body, err := httpx.Get(url, map[string]string{"q": "abc"})
body, err := httpx.GetHeader(url, params, map[string]string{"X-Trace-ID": traceID})
data, err := httpx.GetMap(url, params)
data, err := httpx.GetMapHeader(url, params, headers)

body, err := httpx.PostForm(url, form)
body, err := httpx.PostJSONResp(url, payload)
body, err := httpx.PostJSONRespHeader(url, payload, headers)
data, err := httpx.PostJSON(url, payload)
data, err := httpx.PostJSONHeader(url, payload, headers)

data, err := httpx.GetByCtx(ctx, url, map[string]interface{}{"id": id})
data, err := httpx.PostJSONByCtx(ctx, url, payload)

xmlBody, err := httpx.PostXML(url, map[string]string{"id": "1"})
parsed, err := httpx.ParseXML[Resp](xmlBody)

img, contentType, ext, err := httpx.FetchImage(url)
```

Known boundaries in inspected source:

- `Get` and `PostForm` use package-level `http.Get`/`http.PostForm`, not the timeout-aware shared client.
- `GetHeader`, `PostJSONResp`, and `PostJSONRespHeader` use the shared client.
- `SetTimeOutTmp(duration)` mutates the package-level shared client temporarily; it is process-global and can affect concurrent calls.
- `PostJSONResp` returns an error for non-200/non-201 status and includes the response body string.
- `PostJSONRespHeader` does not reject non-2xx by itself in the inspected source.
- `ParseJSON` returns nil for empty or invalid JSON after logging; callers must validate required fields.
- `ParseXML` panics on invalid XML in the inspected source. Wrap or avoid it when upstream XML may be malformed.
- `FetchImage` infers type from URL suffix and does not enforce response status, response content type, size, or host allowlist.

## Context and Header Propagation

For internal calls that intentionally forward the caller's token:

```go
result, err := httpx.PostJSONByCtx(ctx, upstreamURL, payload)
```

This forwards only `Authorization` in inspected source. If trace or tenant headers must propagate, build an explicit header map:

```go
headers := map[string]string{
    "X-Request-ID": apix.GetTraceID(ctx),
    "X-Tenant-ID": tenantID,
}
result, err := httpx.PostJSONHeader(upstreamURL, payload, headers)
```

Do not forward user tokens to third-party systems unless that is the explicit contract.

## Timeout Pattern

For helpers that use the shared client:

```go
httpx.SetTimeOutTmp(300 * time.Millisecond)
resp, err := httpx.GetHeader(url, nil, nil)
```

Because the timeout is package-global, prefer a narrow call scope and avoid parallel tests that depend on different timeout values. For production-grade per-request cancellation, use a local `http.Client` and `http.NewRequestWithContext` after confirming this custom path with the user.

## Error Mapping

Keep outbound failure handling in the service layer:

- network timeout or connection refused: return a retryable business error when appropriate;
- non-success status: include safe upstream status and correlation id, not raw secrets or full upstream body;
- invalid JSON/XML: return a parse error with enough context for support;
- missing required fields: treat as bad upstream contract, not success with zero values;
- image fetch failures: reject unsupported/oversized/untrusted URLs before download when user-supplied.

## XML Boundary

`PostXML` builds XML from simple string values and is suitable only for flat request bodies. For nested XML or signed XML, use typed `encoding/xml` structs and explicit tests.

Wrap `ParseXML` if malformed XML is a normal upstream failure:

```go
func safeParseXML[T any](body string) (out *T, err *errors.Error) {
    defer func() {
        if r := recover(); r != nil {
            err = errors.Sys("invalid upstream XML")
        }
    }()
    return httpx.ParseXML[T](body)
}
```

## Image Fetch Boundary

Before fetching user-provided image URLs, define:

- allowed schemes and hosts;
- max response bytes;
- accepted content types;
- behavior for redirects;
- storage location and malware scanning responsibility when relevant.

Use the built-in `FetchImage` only for trusted internal or controlled fixture URLs unless these checks are added.

## Verification Checklist

Use a local `httptest.Server` or controlled local HTTP server. Cover:

- GET query parameters;
- form POST content type and body;
- JSON POST request body and response mapping;
- XML POST and parse success;
- custom headers received by upstream;
- `Authorization` forwarding through `GetByCtx` or `PostJSONByCtx` only when intended;
- timeout against a slow handler;
- connection or bad status error handling;
- malformed JSON/XML response behavior;
- image fetch returns bytes, content type, and extension for a controlled image URL;
- no real secrets in URLs, headers, fixtures, or logs.
