# Docker deployment (existing PostgreSQL)

Use this guide when PostgreSQL is already running—on the host, in another container, or as a managed service—and you only need the MCP server.

**Demo with a throwaway database?** Use the [Quick Start](../../README.md#quick-start) (`examples/docker-compose.yaml`) instead.

## 1. Create a read-only role

Run [`examples/sql/create_mcp_readonly_role.sql`](../../examples/sql/create_mcp_readonly_role.sql) as a privileged user. Grant `SELECT` only on relations agents may read. The YAML policy cannot widen PostgreSQL privileges.

## 2. Write `config.yaml`

Copy [`examples/config.minimal.yaml`](../../examples/config.minimal.yaml) or [`examples/config.restricted.yaml`](../../examples/config.restricted.yaml). Keep `security.readonly: true`.

```bash
export DATABASE_URL='postgres://mcp_readonly:SECRET@HOST:5432/app'
export MCP_TOKEN="$(openssl rand -hex 32)"
npm run config:validate
```

## 3. Choose networking

**PostgreSQL in Docker on a user-defined network** (recommended):

```bash
docker network ls
docker inspect <postgres-container> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Use the database container hostname as `DATABASE_URL` host (for example `postgres`).

**PostgreSQL on the host from a container on Linux:**

```bash
export DATABASE_URL='postgres://mcp_readonly:SECRET@host.docker.internal:5432/app'
```

**Managed PostgreSQL:** use the provider hostname and TLS parameters in the URL. Restrict firewall rules to the MCP host only.

## 4. Run the published image

Pin a version tag rather than `latest` in production:

```bash
docker run -d \
  --name postgres-mcp \
  --restart unless-stopped \
  --network YOUR_DOCKER_NETWORK \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL \
  -e MCP_TOKEN \
  -v "$PWD/config.yaml:/app/config.yaml:ro" \
  recordari/postgres-mcp:0.1.0
```

Bind to loopback unless a reverse proxy on the same host terminates TLS:

```bash
-p 127.0.0.1:3000:3000
```

## 5. Verify

```bash
docker ps
docker logs --tail=50 postgres-mcp
curl -fsS http://127.0.0.1:3000/healthz
```

Expected:

```json
{"status":"ok"}
```

MCP smoke test (tools and auth):

```bash
export MCP_TOKEN='...'
bash examples/smoke-test.sh http://127.0.0.1:3000
```

## 6. Connect your MCP client

See [Connect your AI client](../../README.md#connect-your-ai-client). The MCP endpoint is `http://127.0.0.1:3000/mcp` with header `Authorization: Bearer <MCP_TOKEN>`.

## Public endpoints (no bearer token)

| Path | Purpose |
| --- | --- |
| `GET /healthz` | Liveness; returns `{"status":"ok"}` only |
| `GET /logo.png` | Project icon |

`POST /mcp` always requires a valid bearer token. Do not put secrets in URLs.

## Private tailnet access

To expose the MCP over HTTPS on a private VM, see [Private deployment with Tailscale](tailscale.md).