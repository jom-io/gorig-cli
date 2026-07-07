# Gorig CLI

Gorig CLI is the command-line tool for initializing Gorig projects, generating modules, installing the `gorig-backend` skill, and keeping generated projects aligned with the verified Gorig backend roadmap.

## Roadmap Status

The `gorig-backend` skill roadmap is tracked in [docs/gorig-backend-skill-roadmap.md](docs/gorig-backend-skill-roadmap.md). This README documents the stable CLI workflows and the currently verified skill surface.

| Scope | Status |
|---|---|
| Skill foundation, source rules, and version detection | verified |
| Locally runnable basic project generation | verified |
| HTTP API, modules, database, cache, cron, messaging, SSE, auth, security, and outbound networking guidance | verified |
| Observability, deployment, and operations guidance | pending |

## Installation

Install globally using npm:

```sh
npm install -g gorig-cli
```

Or run directly using npx:

```sh
npx gorig-cli@latest <command>
```

## Quick Start

### Initialize a Runnable Project

Use the `init` command to create a new project:

```sh
gorig-cli init my-new-project --gorig-version v0.0.52 --no-start
```

Or use npx:

```sh
npx gorig-cli@latest init my-new-project --gorig-version v0.0.52 --no-start
```

This creates a locally runnable project with `local`, `dev`, and `prod` configuration, one `_cmd` entry point, and a Router-Controller-Service example under `domain/hello`. The basic project does not require MySQL, MongoDB, or Redis.

Useful automation options:

```sh
# Use a custom Go module and base port
gorig-cli init my-new-project \
  --module example.com/my-new-project \
  --gorig-version v0.0.52 \
  --port 9527 \
  --no-start

# Framework development against a local Gorig checkout
gorig-cli init my-new-project \
  --gorig-replace ../gorig \
  --no-start \
  --no-git
```

Use `--force` only when an existing non-empty destination may be replaced. Use `--start` to start immediately; otherwise initialization is non-interactive and does not start the service.

### Create a Basic Module

Use the `create` command in the project root directory to create a new module:

```sh
gorig-cli create user
```

Or use npx:

```sh
npx gorig-cli@latest create user
```

This creates a flat feature-first module under `domain/user`, using the Gorig Router -> Controller -> Service shape without adding database or Redis requirements:

```text
domain/user/
├── router.go
├── controller.go
├── service.go
├── dto.go
└── model/
    └── user.go
```

The generated routes are `GET /user/info` and `POST /user/echo`. More complex persistence-backed CRUD modules should keep the same flat module boundary and add `domainx/dx` access in `service.go` plus storage structs under `model/`.

### Create a Persistent CRUD Module

To generate a persistent CRUD module backed by Gorig `domainx/dx`, choose MySQL or MongoDB explicitly:

```sh
# MySQL CRUD module, with HTTP routes enabled by default
gorig-cli create order --crud --db mysql --db-name Main

# MongoDB CRUD module
gorig-cli create order --crud --db mongo --db-name main

# Service/model CRUD only, without router/controller/doc HTTP adapter
gorig-cli create order --crud --db mysql --no-http
```

Persistent CRUD generation currently supports MySQL and MongoDB. The generated code compiles without a live database, but effect-level create/list/page/update/delete verification requires a matching development database configuration.

The CRUD generator preserves existing named connections and adds non-secret configuration skeletons to `_bin/local.yaml`, `_bin/dev.yaml`, `_bin/prod.yaml`, and `test/_bin/local.yaml`. After filling local values or exporting the documented `GORIG_...` variables, run `go test -tags=integration,mysql ./test/... -v` or `go test -tags=integration,mongo ./test/... -v`.

### Generate API Documentation

Use the `doc` command to generate OpenAPI documentation:

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

After generating the documentation, you can access it through:
http://127.0.0.1:8080/redoc.html

### Install Gorig Skill

Use the `skill` command to install the bundled `gorig-backend` skill for Codex or Claude.

Install the Codex skill globally:

```sh
gorig-cli skill install codex
```

Install both Codex and Claude skills globally:

```sh
gorig-cli skill install all
```

Install the Codex skill into the current repository:

```sh
gorig-cli skill install codex project
```

The install scope defaults to `user`. Use `project` only when the skill should be stored in the current repository.

### Use with AI Agents

After installing the skill, open a Gorig project in Codex or Claude and ask for framework-specific backend work:

```text
Use the gorig-backend skill to add a MySQL order CRUD module with tests and API docs.
```

```text
Use the gorig-backend skill to review startup, routing, config, and middleware usage.
```

```text
Use the gorig-backend skill to add login, protected routes, logout, and security tests.
```

### Run the Project

After entering the project directory, you can run the project using the following commands:

```sh
cd my-new-project
GORIG_SYS_MODE=local go run ./_cmd
```

Or run it after building:

```sh
go build -o my-new-project _cmd/main.go && ./my-new-project
```

## Verified Capabilities

- Dependency-free project bootstrap with `local`, `dev`, and `prod` configuration.
- Flat feature-first module generation under `domain/<module>/`.
- MySQL and MongoDB CRUD generation through Gorig `domainx/dx`.
- API documentation generation for generated HTTP modules.
- Skill installation for Codex and Claude from one canonical bundled source.
- Skill references and fixtures for cache, scheduled tasks, messaging, SSE, authentication, security, and outbound networking.

## Current Boundaries

- Persistent CRUD generation is verified for MySQL and MongoDB.
- Runtime verification for MySQL, MongoDB, and Redis requires configured development infrastructure.
- Observability, deployment, and operations guidance is the next roadmap phase.
- Real remote deployment or production mutation requires explicit user authorization.
