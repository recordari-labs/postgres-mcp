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

## Overview

Give an agent **read-only** access to PostgreSQL without handing it the whole database. `postgres-mcp` speaks [Model Context Protocol](https://modelcontextprotocol.io) over HTTP, accepts a single YAML policy, and refuses to boot if that policy or its secrets are missing.

The PostgreSQL role is the primary boundary. YAML adds schema/table rules, row and time limits, and SQL validation on top.

## Features

- **Read-only by default** — `BEGIN READ ONLY`, no write tools, `security.readonly` cannot be disabled in v0.1
- **YAML policies** — allow/deny schemas and tables, query limits, introspection toggles
- **Docker-ready** — one container, env-based secrets, published as `recordari/postgres-mcp`
- **Private networking** — bind to loopback, shared Docker networks, [Tailscale Serve](docs/deployment/tailscale.md)

## Documentation

| Guide | Description |
| --- | --- |
| [Quick Start](#quick-start) | Disposable demo database + first query |
| [Verify your install](#verify-your-install) | Health check and smoke test |
| [Connect your database](#connect-your-database) | Existing PostgreSQL |
| [Connect your AI client](#connect-your-ai-client) | Cursor / Streamable HTTP |
| [MCP tools](#mcp-tools) | What agents can call |
| [Configuration](docs/configuration.md) | Full YAML reference + [JSON Schema](docs/config.schema.json) |
| [Docker deployment](docs/deployment/docker.md) | Production container layout |
| [Tailscale deployment](docs/deployment/tailscale.md) | Private VM + HTTPS |
| [Security model](SECURITY.md) | Guarantees and limits |
| [Contributing](CONTRIBUTING.md) | How to send changes |
| [Agent instructions](AGENTS.md) | For AI agents editing this repo |

## Quick Start

> **Demo only.** This starts a **throwaway PostgreSQL** and builds the MCP server from source. You do not need an existing database or credentials.

Already have PostgreSQL? Skip to [Connect your database](#connect-your-database).

```bash
git clone https://github.com/recordari/postgres-mcp.git
cd postgres-mcp
export MCP_TOKEN="$(openssl rand -hex 32)"
docker compose -f examples/docker-compose.yaml up --build
```

In another terminal, verify and smoke-test:

```bash
curl -fsS http://127.0.0.1:3000/healthz
export MCP_TOKEN   # same value as above
bash examples/smoke-test.sh http://127.0.0.1:3000
```

Expected health response:

```json
{"status":"ok"}
```

Then connect your client ([below](#connect-your-ai-client)) and ask: **What tables are available in my database?**

For a **published image** (no local build), see [Docker deployment](docs/deployment/docker.md).

## Verify your install

| Step | Command | Success |
| --- | --- | --- |
| Health | `curl -fsS http://127.0.0.1:3000/healthz` | `{"status":"ok"}` |
| Logs | `docker logs --tail=50 postgres-mcp` | No config or auth errors |
| MCP | `bash examples/smoke-test.sh` | `OK: postgres-mcp passed smoke checks` |

`GET /healthz` and `GET /logo.png` do not require authentication and return no database content. `POST /mcp` always requires `Authorization: Bearer <MCP_TOKEN>`.

Validate a config file before deploy:

```bash
export CONFIG_PATH=./config.yaml
export DATABASE_URL='postgres://...'
export MCP_TOKEN='...'
npm run config:validate
```

## Connect your database

1. Create a least-privilege role — [`examples/sql/create_mcp_readonly_role.sql`](examples/sql/create_mcp_readonly_role.sql).
2. Copy [`examples/config.minimal.yaml`](examples/config.minimal.yaml) to `config.yaml` and adjust `security.access`.
3. Follow [Docker deployment](docs/deployment/docker.md) for networking and `docker run`.

Production image (pin a version tag):

```bash
export DATABASE_URL='postgres://mcp_readonly:SECRET@postgres:5432/app'
export MCP_TOKEN="$(openssl rand -hex 32)"

docker run -d \
  --name postgres-mcp \
  --restart unless-stopped \
  --network your-docker-network \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL \
  -e MCP_TOKEN \
  -v "$PWD/config.yaml:/app/config.yaml:ro" \
  recordari/postgres-mcp:0.1.0
```

Private HTTPS via Tailscale: [docs/deployment/tailscale.md](docs/deployment/tailscale.md).

## Connect your AI client

Streamable HTTP MCP clients need the `/mcp` URL and a bearer header. Example for Cursor — [`examples/cursor/mcp.json`](examples/cursor/mcp.json):

```json
{
  "mcpServers": {
    "postgres": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

Replace the URL when using Tailscale or another reverse proxy. If you use a Tailscale hostname, add it to `security.http.allowedHosts` in `config.yaml`.

## MCP tools

| Tool | Purpose | Limits |
| --- | --- | --- |
| `list_schemas` | Authorized schema names | No SQL; off when `security.introspection.enabled: false` |
| `list_tables` | Tables/views in one schema | Omits views that depend on denied relations |
| `describe_table` | Columns, types, indexes | Policy-checked; no row samples |
| `execute_query` | One `SELECT` / `WITH` query | `maxRows`, `timeoutMs`, read-only txn; writes rejected |

v0.1 has no migrations, DML, tuning helpers, or multi-user tokens. Rotate `MCP_TOKEN` to revoke access.

Tool descriptions are also exposed to clients via MCP `tools/list`.

## Configuration

See [docs/configuration.md](docs/configuration.md) for every key, default, and placeholder rule. Editor autocomplete: [docs/config.schema.json](docs/config.schema.json) (regenerate with `npm run config:schema`; attached to each [GitHub Release](https://github.com/recordari/postgres-mcp/releases)).

Minimal shape:

```yaml
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
  queries:
    maxRows: 1000
    timeoutMs: 10000
    singleStatement: true
```

Only `${DATABASE_URL}` and `${MCP_TOKEN}` may appear in YAML. Unknown placeholders abort startup.

## Security model

Three layers (outer layers never replace the database role):

1. **PostgreSQL privileges** — role can only `SELECT` what you granted.
2. **Read-only execution** — `BEGIN READ ONLY`, `statement_timeout`, cursor `FETCH` capped at `maxRows`.
3. **Declarative YAML + SQL parser** — relation allow/deny, conservative view expansion, denied functions and statement types.

View expansion via `pg_depend` is not a guarantee against every indirect data path—use approved views in a locked-down schema when data is sensitive. Details and disclosure: [SECURITY.md](SECURITY.md).

## Releases

Version lives in `package.json`. Tags must match before Docker Hub publish.

```bash
npm version patch -m "Release %s"
git push origin HEAD --follow-tags
```

| Image tag | When |
| --- | --- |
| `recordari/postgres-mcp:1.4.2` | every release |
| `recordari/postgres-mcp:1.4` | every release |
| `recordari/postgres-mcp:latest` | stable releases only |

CI needs `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets.

## Development

Node.js 22+. Agents editing the code should read [AGENTS.md](AGENTS.md).

```bash
npm ci
npm test
npm run lint
DATABASE_URL=postgres://postgres:postgres@localhost:5432/app npm run test:integration
```

## License

[Apache License 2.0](LICENSE). Copyright 2026 Recordari.