# Gorig CLI: Project Generator and AI Skill Installer

`gorig-cli` is the command-line entry point for Gorig backend development. It creates runnable Gorig projects, generates feature modules, builds persistence-backed CRUD services, produces API documentation, and installs the `gorig-backend` skill for Codex and Claude.

Use it when you want generated code to follow the same Gorig structure and framework conventions instead of starting from ad hoc scaffolding.

Main Gorig framework repository: [https://github.com/jom-io/gorig](https://github.com/jom-io/gorig)

## What It Does

| Capability | Description |
|---|---|
| Project bootstrap | Create a locally runnable Gorig service with `_cmd`, environment configs, domain registration, example routes, and tests. |
| Module generation | Add flat feature modules under `domain/<module>/` using Router -> Controller -> Service -> Model boundaries. |
| Persistent CRUD | Generate MySQL or MongoDB CRUD modules backed by Gorig `domainx/dx`, with tests, docs, and non-secret config skeletons. |
| API documentation | Generate OpenAPI/Redoc documentation for generated HTTP modules. |
| AI skill installation | Install the bundled `gorig-backend` skill so Codex or Claude can work with Gorig projects using framework-aware rules. |
| Framework development | Generate projects against a local Gorig checkout with `--gorig-replace` when developing the framework itself. |

## Installation

Run without installing globally:

```sh
npx gorig-cli@latest <command>
```

Or install globally:

```sh
npm install -g gorig-cli
gorig-cli <command>
```

## Create a New Backend

```sh
npx gorig-cli@latest init my-new-project --no-start
```

Or with a global install:

```sh
gorig-cli init my-new-project --no-start
```

The generated project includes:

- one `_cmd` entry point
- `local`, `dev`, and `prod` configuration
- `domain/init.go` registration
- an example `domain/hello` module
- tests under `test/`
- no required MySQL, MongoDB, or Redis dependency in the basic profile

Useful automation options:

```sh
gorig-cli init my-new-project \
  --module example.com/my-new-project \
  --gorig-version latest \
  --port 9527 \
  --no-start
```

For framework development against a local checkout:

```sh
gorig-cli init my-new-project \
  --gorig-replace ../gorig \
  --no-start \
  --no-git
```

Use `--force` only when an existing non-empty destination may be replaced. Use `--start` to start immediately; otherwise initialization is non-interactive and does not start the service.

## Add a Module

Run from the generated project root:

```sh
npx gorig-cli@latest create user
```

Or with a global install:

```sh
gorig-cli create user
```

This creates:

```text
domain/user/
├── router.go
├── controller.go
├── service.go
├── dto.go
└── model/
    └── user.go
```

The generated basic routes are `GET /user/info` and `POST /user/echo`.

## Generate Persistent CRUD

Choose the storage backend explicitly:

```sh
# MySQL CRUD module, with HTTP routes enabled by default
gorig-cli create order --crud --db mysql --db-name Main

# MongoDB CRUD module
gorig-cli create order --crud --db mongo --db-name main

# Service/model CRUD only, without router/controller/doc HTTP adapter
gorig-cli create order --crud --db mysql --no-http
```

Persistent CRUD generation currently supports MySQL and MongoDB. The generated code compiles without a live database, but effect-level create/list/page/update/delete verification requires a matching development database configuration.

The CRUD generator preserves existing named connections and adds non-secret configuration skeletons to `_bin/local.yaml`, `_bin/dev.yaml`, `_bin/prod.yaml`, and `test/_bin/local.yaml`.

After filling local values or exporting the documented `GORIG_...` variables, run:

```sh
go test -tags=integration,mysql ./test/... -v
go test -tags=integration,mongo ./test/... -v
```

## Generate API Documentation

```sh
# Generate documentation for all modules
gorig-cli doc

# Generate documentation for a specific module
gorig-cli doc user
```

Or use npx:

```sh
npx gorig-cli@latest doc
npx gorig-cli@latest doc user
```

After generating documentation, access it through:

```text
http://127.0.0.1:8080/redoc.html
```

## Install Gorig Backend Skill

The CLI bundles the `gorig-backend` skill for Codex and Claude. Install it when you want AI agents to implement, review, test, or troubleshoot Gorig projects with framework-aware rules.

```sh
# Codex global skill
gorig-cli skill install codex

# Codex and Claude global skills
gorig-cli skill install all

# Codex skill stored in the current repository
gorig-cli skill install codex project
```

The install scope defaults to `user`. Use `project` only when the skill should be stored in the current repository.

Example prompts:

```text
Use the gorig-backend skill to add a MySQL order CRUD module with tests and API docs.
```

```text
Use the gorig-backend skill to review startup, routing, config, and middleware usage.
```

```text
Use the gorig-backend skill to add login, protected routes, logout, and security tests.
```

## Run the Project

```sh
cd my-new-project
GORIG_SYS_MODE=local go run ./_cmd
```

Or run it after building:

```sh
go build -o my-new-project _cmd/main.go
GORIG_SYS_MODE=local ./my-new-project
```

## Verification Notes

- Basic project generation is dependency-light and should build without MySQL, MongoDB, or Redis.
- Persistent CRUD is generated for MySQL and MongoDB.
- Database and Redis behavior should be verified against configured development infrastructure.
- Remote deployment or production mutation should be performed only after explicit authorization.
