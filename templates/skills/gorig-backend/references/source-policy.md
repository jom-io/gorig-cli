# Source and Version Policy

Use this policy before selecting any Gorig API or example.

## Evidence Order

1. Read the target project's `go.mod` and all `replace` directives.
2. Prefer the exact resolved dependency source in the Go module cache.
3. Use a local sibling Gorig checkout only when it matches the project version or the task explicitly targets that checkout.
4. Use the matching public GitHub tag or commit for versioned work.
5. Use GitHub `master` only for explicit latest-version, framework-development, or upgrade work.
6. Use bundled examples only as offline fallbacks and re-check their signatures before editing.

## Required Version Report

Before a material change, report:

- Target module name and Go version.
- Required Gorig version or pseudo-version.
- Active `replace` target, if any.
- Source directory used for verification.
- Whether the work preserves the current version or upgrades it.

Do not silently run `go get ...@latest` in an existing project.

## Source Resolution

Run:

```sh
scripts/detect-gorig-context.sh /path/to/project
```

If the script cannot locate an exact source directory:

1. Run `go env GOMODCACHE` from the target project.
2. Use `go list -m -json github.com/jom-io/gorig` when dependencies are available.
3. Inspect a compatible local checkout.
4. Ask before downloading or upgrading dependencies when that changes external state.

## Compatibility Decisions

- Preserve the current dependency for feature work unless the user requests an upgrade or the requested capability is unavailable.
- Treat a pseudo-version as commit-specific. Do not substitute the nearest release without comparison.
- When local `master` differs from the resolved module, compare signatures and behavior explicitly.
- Prefer APIs already used by the target repository when both legacy and newer APIs exist.
- Mark version-dependent advice in code comments or delivery notes when future maintenance could otherwise misread it.

## Capability Maturity

Use these labels:

- `verified`: Confirmed by source plus a compiling or behavioral test for the selected version.
- `experimental`: Present in source but incomplete, risky, or lacking sufficient behavioral verification.
- `deprecated`: Explicitly deprecated by source or replaced by a preferred API.
- `unsupported`: Stubbed, absent, or known not to work for the required scenario.

Never convert `experimental` or `unsupported` into a working example without first proving it.
