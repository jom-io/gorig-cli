# Gorig CLI

Gorig CLI is a scaffolding tool based on Node.js, used for quickly creating the project structure and modules based on the Gorig framework for Go.

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

### Initialize a New Project

Use the `init` command to create a new project:

```sh
gorig-cli init my-new-project
```

Or use npx:

```sh
npx gorig-cli@latest init my-new-project
```

This will create a new project in the current directory, including basic files and directories like `_cmd/main.go`, `domain/init.go`, `cron/cron.go`, etc.

### Create a New Module

Use the `create` command in the project root directory to create a new module:

```sh
gorig-cli create user
```

Or use npx:

```sh
npx gorig-cli@latest create user
```

This will create a module named `user` in the project, including folders like `api/`, `internal/`, `model/`, and necessary code.

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

### Run the Project

After entering the project directory, you can run the project using the following commands:

```sh
cd my-new-project
go run _cmd/main.go
```

Or run it after building:

```sh
go build -o my-new-project _cmd/main.go && ./my-new-project
```

