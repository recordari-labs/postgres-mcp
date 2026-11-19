<p align="center">
  <img src="assets/logo.png" alt="postgres-mcp" width="220">
</p>

<h1 align="center">postgres-mcp</h1>

<p align="center">
  A secure, self-hosted PostgreSQL MCP server.<br>
  One Docker container. One YAML file. Read-only by default.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue"></a>
  <img alt="Node.js 22" src="https://img.shields.io/badge/node-%3E%3D22-339933">
  <img alt="Read-only by default" src="https://img.shields.io/badge/PostgreSQL-read--only%20by%20default-336791">
</p>

Give an agent a PostgreSQL database without giving it the database. `postgres-mcp` speaks [Model Context Protocol](https://modelcontextprotocol.io) over HTTP, runs only `SELECT`, and refuses to start unless a YAML policy is present. You configure credentials, mount one file, and run one container. There is no account, dashboard, or control plane.

The database role is still the real boundary. The YAML file adds a second one: which schemas and tables the tools may name, how many rows come back, and how long a query may run.

## Start here

You need Docker and a PostgreSQL database. The example stack builds the server and a disposable database so you can see a query before pointing it at your own.

```bash
git clone https://github.com/recordari/postgres-mcp.git
cd postgres-mcp
export MCP_TOKEN="$(openssl rand -hex 32)"
docker compose -f examples/docker-compose.yaml up --build
```

The server listens on `http://127.0.0.1:3000/mcp`. It exits immediately if the config file, `DATABASE_URL`, or `MCP_TOKEN` is missing, or if `security.readonly` is set to `false`.

Connect Cursor (or any Streamable HTTP client) with [`examples/cursor/mcp.json`](examples/cursor/mcp.json):

```json
{
  "mcpServers": {
    "postgres": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

Then ask: **What tables are available in my database?**

To use your own database, create a least-privilege role with [`examples/sql/create_mcp_readonly_role.sql`](examples/sql/create_mcp_readonly_role.sql), copy [`examples/config.minimal.yaml`](examples/config.minimal.yaml) to `config.yaml`, and run:

```bash
export DATABASE_URL='postgres://mcp_readonly:replace-me@db.internal:5432/app'
export MCP_TOKEN="$(openssl rand -hex 32)"

docker run -d \
  --name postgres-mcp \
  --network your-private-network \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL \
  -e MCP_TOKEN \
  -v "$PWD/config.yaml:/app/config.yaml:ro" \
  recordari/postgres-mcp:0.1.0
```

Publish the image from a release tag, or build it locally with `docker build -t postgres-mcp .`. Keep the port on localhost or a private network. Tailscale, SSH, and a reverse proxy are all fine. The server does not open those paths itself.

`GET /healthz` returns `{"status":"ok"}`. `GET /logo.png` serves the project mark, which the server also advertises to MCP clients.

## Tools

| Tool | What the agent gets |
| --- | --- |
| `list_schemas` | Schemas the policy allows and the database role can use |
| `list_tables` | Tables and views in one of those schemas |
| `describe_table` | Columns, types, defaults, and indexes |
| `execute_query` | One `SELECT`, inside a read-only transaction, with a row cap and a timeout |

Views that read a denied table are hidden from `list_tables` and rejected by `execute_query`. Set `security.introspection.enabled: false` to turn off the first three tools.

v0.1 does not migrate databases, write rows, tune queries, or manage users. One bearer token is the whole audience. Rotate it to revoke access.

## Configuration

[`examples/config.minimal.yaml`](examples/config.minimal.yaml) is the contract. [`examples/config.restricted.yaml`](examples/config.restricted.yaml) is the same contract with an explicit table allow-list.

```yaml
server:
  host: 0.0.0.0
  port: 3000
  path: /mcp

database:
  url: ${DATABASE_URL}

security:
  authentication:
    type: bearer
    token: ${MCP_TOKEN}
  readonly: true
  access:
    schemas:
      allow: [public]
    tables:
      deny:
        - public.user_credentials
  queries:
    timeoutMs: 10000
    maxRows: 1000
    maxConcurrent: 3
    singleStatement: true

logging:
  level: info
  logQueries: false
```

Only `${DATABASE_URL}` and `${MCP_TOKEN}` are substituted. Any other placeholder aborts startup, so a typo cannot silently boot an unprotected server. If you omit a limit, the default stays conservative: read-only, one statement, 1,000 rows, 10 seconds, three concurrent queries, and the `public` schema.

`security.http.allowedHosts` is matched without the port and blocks DNS rebinding. A request that sends `Origin` must match `allowedOrigins` (localhost unless you set the list). `POST /mcp` must use `Content-Type: application/json`.

## Security model

Three layers. The outer ones do not replace the inner one.

1. **PostgreSQL privileges.** The connection string belongs to a role that can `SELECT` only what you mean to expose. Start from [`examples/sql/create_mcp_readonly_role.sql`](examples/sql/create_mcp_readonly_role.sql).
2. **Read-only transactions.** Every accepted statement runs after `BEGIN READ ONLY`, with a local `statement_timeout`. The session also sets `default_transaction_read_only`. There is no write tool in v0.1. `readonly: false` aborts startup unless you explicitly set `POSTGRES_MCP_ALLOW_WRITES=true`, and even then statements still run read-only.
3. **Declarative policy.** Allow and deny lists are checked before execution. A PostgreSQL parser extracts every relation from `SELECT` and `WITH`, including joins, subqueries, and CTEs. Views and materialized views are expanded through `pg_depend`. `FROM` functions, `SELECT INTO`, row locks, multiple statements, and a denylist of file, network, and session functions are rejected. SQL the parser cannot accept is rejected.

The policy can narrow the database role. It cannot grant anything that role does not already have. For sensitive data, create a schema of approved views and grant the MCP role access only to that schema. A view owned by a privileged role can hide tables from `pg_depend` when those dependencies are not visible to the MCP role, so own the views with a role that itself cannot read secrets.

The checks above are what `test/security` and `test/integration` cover. They are not a promise of perfect SQL isolation. See [SECURITY.md](SECURITY.md) to report a bypass.

## Releases

`package.json` is the version. The MCP server reports that same value, and a Docker tag is published only when it matches.

From a clean `main` branch:

```bash
npm version patch -m "Release %s"
git push origin HEAD --follow-tags
```

`minor` and `major` work the same way. You can also open Actions, run **Release**, and choose the bump. That workflow commits `Release x.y.z`, pushes `vx.y.z`, and publishes the image.

A tag `v1.4.2` publishes:

| Tag | When |
| --- | --- |
| `recordari/postgres-mcp:1.4.2` | every release |
| `recordari/postgres-mcp:1.4` | every release |
| `recordari/postgres-mcp:latest` | stable releases only, not pre-releases |

Images are built for `linux/amd64` and `linux/arm64`. The repository needs two Actions secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`, a Docker Hub access token that can write to `recordari/postgres-mcp`.

## Development

Node.js 22 or newer.

```bash
npm ci
npm test
npm run lint
DATABASE_URL=postgres://postgres:postgres@localhost:5432/app npm run test:integration
```

`PolicyService`, `SqlValidator`, and `QueryExecutor` do not import MCP. NestJS is the HTTP adapter. Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE). Copyright 2026 Recordari.
