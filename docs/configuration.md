# Configuration reference

JSON Schema for editors: **[config.schema.json](config.schema.json)** (`npm run config:schema` regenerates it from Zod).

Add at the top of your `config.yaml`:

```yaml
# yaml-language-server: $schema=./docs/config.schema.json
```

In VS Code / Cursor, associate the schema once in `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "./docs/config.schema.json": "config.yaml"
  }
}
```

The server reads a single YAML file (default `config.yaml`, override with `CONFIG_PATH`). Only `${DATABASE_URL}` and `${MCP_TOKEN}` are expanded from the environment. Any other `${VAR}` causes startup to fail.

Validate a file without starting the server:

```bash
export CONFIG_PATH=./config.yaml
export DATABASE_URL='postgres://...'
export MCP_TOKEN='at-least-sixteen-chars'
npm run config:validate
```

## `server`

| Key | Default | Description |
| --- | --- | --- |
| `host` | `0.0.0.0` | HTTP bind address |
| `port` | `3000` | HTTP port |
| `path` | `/mcp` | MCP Streamable HTTP route |

## `database`

| Key | Default | Description |
| --- | --- | --- |
| `url` | required | PostgreSQL connection string (use `${DATABASE_URL}`) |
| `pool.max` | `5` | Max pool connections |
| `pool.connectionTimeoutMs` | `5000` | Pool connect timeout |

## `security.authentication`

| Key | Default | Description |
| --- | --- | --- |
| `type` | `bearer` | Only `bearer` is supported in v0.1 |
| `token` | required | Bearer secret (use `${MCP_TOKEN}`, min 16 chars) |
| `resource` | derived | OAuth resource URL for MCP auth metadata. Defaults to `http://127.0.0.1:<port><path>`. Set this when clients reach the server through Tailscale or another public hostname. |

## `security.readonly`

| Value | Behavior |
| --- | --- |
| `true` (default) | Required for v0.1 |
| `false` | Startup fails |

## `security.access`

| Key | Description |
| --- | --- |
| `defaultSchema` | Default for unqualified names in SQL (optional) |
| `schemas.allow` | Allowed schemas (default `['public']`) |
| `schemas.deny` | Denied schemas (wins over allow) |
| `tables.allow` | If set, only these `schema.table` names are allowed |
| `tables.deny` | Denied tables (wins over allow) |

Deny always wins. An explicit `tables.allow` list makes the policy closed: anything not listed is rejected.

## `security.http`

| Key | Default | Description |
| --- | --- | --- |
| `allowedHosts` | `localhost`, `127.0.0.1`, `[::1]` | Hostnames allowed in the `Host` header (port ignored). **Add your Tailscale hostname here** when using Tailscale Serve. |
| `allowedOrigins` | localhost defaults | Browser `Origin` allow list. Omit to keep defaults. Set `false` in code is not exposed in YAML; use explicit hostnames for tailnets. |

## `security.queries`

| Key | Default | Description |
| --- | --- | --- |
| `timeoutMs` | `10000` | `statement_timeout` per query (ms) |
| `maxRows` | `1000` | Max rows returned; enforced with `FETCH n+1` on a cursor |
| `maxConcurrent` | `3` | Concurrent `execute_query` calls |
| `maxSqlLength` | `10000` | Max SQL string length |
| `singleStatement` | `true` | Must stay `true` in v0.1 |

## `security.introspection`

| Key | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | When `false`, disables `list_schemas`, `list_tables`, `describe_table` |
| `expandViews` | `true` | Walk `pg_depend` for views; reject hidden base tables |

## `logging`

| Key | Default | Description |
| --- | --- | --- |
| `level` | `info` | Pino log level |
| `logQueries` | `false` | Log full SQL text (use only for debugging) |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `CONFIG_PATH` | no | Path to YAML (default `config.yaml`) |
| `DATABASE_URL` | yes* | Substituted into config when referenced |
| `MCP_TOKEN` | yes* | Substituted into config when referenced |

\*Required when the YAML uses `${DATABASE_URL}` / `${MCP_TOKEN}` placeholders.

## Examples

- [examples/config.minimal.yaml](../examples/config.minimal.yaml)
- [examples/config.restricted.yaml](../examples/config.restricted.yaml)
- [examples/config.docker.yaml](../examples/config.docker.yaml)