# Environment Configuration

Gorig configuration uses Viper and loads a YAML file from `./_bin/` or `./`. The configuration name is selected before file loading.

## Select an Environment

Use the `GORIG_SYS_MODE` environment variable:

```sh
GORIG_SYS_MODE=local go run ./_cmd
GORIG_SYS_MODE=dev go run ./_cmd
GORIG_SYS_MODE=prod ./demo-api
```

The basic project generates:

- `_bin/local.yaml`
- `_bin/dev.yaml`
- `_bin/prod.yaml`

Each file declares its own `sys.mode` and HTTP address. The generated `/hello` response includes the loaded mode so the selection can be effect-tested.

## Override Values

Gorig uses the `GORIG` prefix and replaces dots with underscores. Examples:

```sh
GORIG_SYS_MODE=prod
GORIG_API_REST_ADDR=:8080
```

Use environment variables or external secret management for passwords, private keys, tokens, and production endpoints. Do not put real secrets in generated or skill examples.

## Working Directory Requirement

Configuration paths are relative to the process working directory. Start the application from the project root unless the deployment explicitly arranges the configuration path.

Go tests run with each package directory as the working directory. Shared external-style tests therefore keep a minimal configuration under `test/_bin/local.yaml`.

## Validate Selection

Do not validate configuration only by checking files. Start at least two environments and assert:

- The process listens on the expected port.
- `/hello` returns the expected `mode`.
- Shutdown completes cleanly.

If an environment variable overrides the port, report that override in the verification evidence.
