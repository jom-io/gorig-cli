# Basic Project Bootstrap

Use this workflow when creating a new locally runnable Gorig backend.

## Confirm Before Creation

Confirm or infer safely:

- Project directory and Go module name.
- Gorig version: preserve a requested version; otherwise use the selected stable version and report the resolution.
- Whether an existing non-empty directory may be replaced. Never pass `--force` without explicit authorization.
- Local base port.
- Git initialization is a post-generation skill step. Ask after generation and verification; do not let the CLI initialize Git implicitly.

The basic profile must not require MySQL, MongoDB, or Redis.

## Generate

Choose the generator before executing:

1. When validating an unreleased sibling `gorig-cli` checkout, and `../gorig-cli/bin/cli.js` exists, use `node ../gorig-cli/bin/cli.js` so the test does not accidentally invoke an older global npm package.
2. Otherwise use the installed `gorig-cli` command.
3. Report which generator path and version are being used.

When `gorig-cli` is installed:

```sh
gorig-cli init demo-api \
  --module example.com/demo-api \
  --gorig-version v0.0.52 \
  --port 9527 \
  --no-start \
  --no-git
```

Unreleased sibling-checkout validation:

```sh
node ../gorig-cli/bin/cli.js init demo-api \
  --module example.com/demo-api \
  --gorig-version v0.0.52 \
  --port 9527 \
  --no-start \
  --no-git
```

During framework development, use a verified local checkout without downloading another version:

```sh
gorig-cli init demo-api \
  --module example.com/demo-api \
  --gorig-replace ../gorig \
  --port 9527 \
  --no-start \
  --no-git
```

Supported automation flags:

- `--module <path>`: Go module name; defaults to the project directory name.
- `--gorig-version <version>`: release, commit, branch, or `latest`.
- `--gorig-replace <path>`: local Gorig checkout; records a Go `replace` directive.
- `--port <port>`: local port; dev and prod use the next two ports.
- `--force`: replace a non-empty destination; requires explicit authorization.
- `--start`: start after generation; the default is not to start.
- `--no-start`: explicit non-interactive behavior.
- `--no-git`: skip `git init`.

## Expected Structure

```text
demo-api/
├── _bin/
│   ├── local.yaml
│   ├── dev.yaml
│   └── prod.yaml
├── _cmd/main.go
├── domain/
│   ├── init.go
│   └── hello/
│       ├── router.go
│       ├── controller.go
│       └── service.go
├── global/config.go
├── test/
│   ├── _bin/local.yaml
│   └── hello_test.go
├── .gitignore
├── README.md
├── go.mod
└── go.sum
```

`bootstrap.StartUp()` owns the built-in HTTP registration. The generated domain registers routes only; it must not register `httpx.Startup` a second time.

## Verify

Run from the generated project:

```sh
go fmt ./...
go vet ./...
go build ./...
go test ./... -v
```

For repeatable behavior verification:

```sh
<skill-dir>/scripts/verify-basic-project.sh . local
<skill-dir>/scripts/verify-basic-project.sh . dev
```

The verification script builds the binary, starts the selected environment, checks `/ping` and `/hello`, sends `SIGINT`, and requires a clean graceful shutdown.

## Optional Git Initialization

This is owned by the skill workflow, not by a new CLI command or flag.

After project generation and verification pass, ask the user whether to initialize Git and create the first commit. If the user says yes:

1. Copy the skill asset `assets/gorig.gitignore` to the project root as `.gitignore`. For a freshly generated project, replacing the generated `.gitignore` is expected. If the project already has user edits, merge instead of overwriting.
2. Run `git init` from the project root when `.git/` does not already exist.
3. Run `git add .`.
4. Run `git commit -m "chore: initialize gorig project"`.
5. Run `git status --short` and report whether the worktree is clean.

Do not initialize Git or create a commit without explicit user confirmation. Do not commit files excluded by `assets/gorig.gitignore`, especially runtime logs, caches, local secrets, private certificates, or machine-specific override configuration.
