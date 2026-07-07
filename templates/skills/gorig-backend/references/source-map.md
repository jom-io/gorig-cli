# Source Map

Prefer an exact version or commit over the moving `master` links below.

## Core Framework

- Repository: `https://github.com/jom-io/gorig`
- Startup: `https://github.com/jom-io/gorig/blob/master/bootstrap/startup.go`
- Service lifecycle: `https://github.com/jom-io/gorig/blob/master/serv/serv.go`
- HTTP: `https://github.com/jom-io/gorig/tree/master/httpx`
- API helpers: `https://github.com/jom-io/gorig/tree/master/apix`
- Data access: `https://github.com/jom-io/gorig/tree/master/domainx`
- dx facade: `https://github.com/jom-io/gorig/blob/master/domainx/dx/dx.go`
- Cache: `https://github.com/jom-io/gorig/tree/master/cache`
- Scheduled tasks: `https://github.com/jom-io/gorig/tree/master/cronx`
- Messaging: `https://github.com/jom-io/gorig/tree/master/mid/messagex`
- Authentication: `https://github.com/jom-io/gorig/tree/master/mid/tokenx`
- Auth middleware: `https://github.com/jom-io/gorig/blob/master/httpx/mid.sign.go`
- Security middleware: `https://github.com/jom-io/gorig/blob/master/httpx/mid.cors.go`, `https://github.com/jom-io/gorig/blob/master/httpx/mid.debounce.go`
- Outbound HTTP: `https://github.com/jom-io/gorig/blob/master/httpx/http.go`
- Tests: `https://github.com/jom-io/gorig/tree/master/test`

To inspect a release, replace `/master/` with the tag, for example `/v0.0.52/`, after confirming the tag exists.

## Ecosystem

- Service registry: `https://github.com/jom-io/gorig-hub`
- Service node/client: `https://github.com/jom-io/gorig-node`
- Operations and deployment: `https://github.com/jom-io/gorig-om`

Check each repository's `go.mod`; ecosystem projects may pin different Gorig versions.

## Local Sibling Discovery

When working inside a directory such as `<workspace>/gorig-cli`, check sibling directories only after resolving the target dependency:

```sh
find .. -maxdepth 2 -name go.mod -print
git -C ../gorig branch --show-current
git -C ../gorig log -1 --oneline
```

Useful local examples may exist in business repositories, but they are evidence of usage, not a replacement for the framework API source. Avoid copying product-specific dependencies, secrets, or architecture without evaluating fit.
