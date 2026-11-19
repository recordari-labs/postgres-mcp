# Private deployment with Tailscale

Run `postgres-mcp` on a Linux VM next to an existing PostgreSQL Docker container, then reach it from Cursor or another MCP client over your **tailnet**—without publishing PostgreSQL or the MCP port on the public internet.

Official references: [Install Tailscale on Linux](https://tailscale.com/docs/install/linux), [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [Host a private server in Docker](https://tailscale.com/docs/solutions/host-private-server-docker).

## Architecture

```text
AI Client (Cursor / Claude)
          |
          | Tailscale tailnet (HTTPS + Bearer token)
          v
  Linux VM (Tailscale)
          |
     Tailscale Serve  -->  http://127.0.0.1:3000
          |
  +-----------------------------+
  | Docker private network      |
  |  postgres-mcp  -->  postgres|
  +-----------------------------+
```

- PostgreSQL stays off the public internet (no published `5432`).
- MCP binds to **loopback** on the VM; Tailscale Serve proxies HTTPS to it.
- Use **Tailscale Serve**, not Funnel (Funnel is public).

## Prerequisites

- Linux VM with Docker
- PostgreSQL container on a user-defined Docker network
- Read-only PostgreSQL role (see [`examples/sql/create_mcp_readonly_role.sql`](../../examples/sql/create_mcp_readonly_role.sql))
- Tailscale account; client devices on the same tailnet
- MagicDNS and HTTPS certificates enabled on the tailnet (recommended)

## Step 1 — Find the PostgreSQL Docker network

```bash
docker ps
docker inspect <postgres-container> \
  --format '{{json .NetworkSettings.Networks}}'
```

Note the user-defined network (for example `staging-network`). The MCP container joins the same network and uses the database **container name** as hostname in `DATABASE_URL`.

## Step 2 — Configure postgres-mcp

```bash
mkdir -p ~/postgres-mcp && cd ~/postgres-mcp
cp /path/to/repo/examples/config.minimal.yaml ./config.yaml
```

Edit `config.yaml`:

1. Keep `security.readonly: true`.
2. Set schema/table allow and deny lists for your data.
3. **Add your Tailscale machine hostname** to `security.http.allowedHosts` (hostname only, no port):

```yaml
security:
  http:
    allowedHosts:
      - localhost
      - 127.0.0.1
      - "[::1]"
      - staging-db.example-tailnet.ts.net
```

If the hostname is missing, Tailscale routes traffic correctly but the server returns **403** on MCP requests.

Set `security.authentication.resource` to the HTTPS MCP URL clients will use, for example:

```yaml
security:
  authentication:
    token: ${MCP_TOKEN}
    resource: https://staging-db.example-tailnet.ts.net/mcp
```

Generate secrets:

```bash
export MCP_TOKEN="$(openssl rand -hex 32)"
export DATABASE_URL='postgresql://mcp_readonly:PASSWORD@postgres:5432/app'
npm run config:validate   # from a dev checkout, or copy validated YAML manually
```

Do not commit tokens or passwords.

## Step 3 — Run the MCP container

Replace `staging-network` with your network name:

```bash
docker run -d \
  --name postgres-mcp \
  --restart unless-stopped \
  --network staging-network \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL \
  -e MCP_TOKEN \
  -v "$PWD/config.yaml:/app/config.yaml:ro" \
  recordari/postgres-mcp:0.1.0
```

The `-p 127.0.0.1:3000:3000` flag keeps the MCP off the VM's public interfaces.

Verify on the VM:

```bash
docker logs --tail=50 postgres-mcp
curl -fsS http://127.0.0.1:3000/healthz
```

Expected:

```json
{"status":"ok"}
```

## Step 4 — Install and join Tailscale on the VM

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale status
```

## Step 5 — Publish with Tailscale Serve

```bash
sudo tailscale serve --bg 3000
sudo tailscale serve status
```

Your private URL will look like `https://staging-db.example-tailnet.ts.net`. The MCP endpoint is:

```text
https://staging-db.example-tailnet.ts.net/mcp
```

## Step 6 — Connect your MCP client

On a device joined to the tailnet:

```json
{
  "mcpServers": {
    "staging-postgres": {
      "url": "https://staging-db.example-tailnet.ts.net/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

Ask: *What tables are available in the staging database?*

Cloud-hosted assistants do not inherit your tailnet; the client must run on a tailnet-connected device (for example Cursor on your laptop).

## Step 7 — Security checks

PostgreSQL should not publish port 5432:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

MCP should map only to loopback:

```bash
docker port postgres-mcp
```

Expected: `3000/tcp -> 127.0.0.1:3000`

From a tailnet client:

```bash
curl -fsS https://staging-db.example-tailnet.ts.net/healthz
```

Disconnect Tailscale on the client and confirm the URL is unreachable.

Run [`examples/smoke-test.sh`](../../examples/smoke-test.sh) against the public HTTPS URL only if you extended `allowedHosts` to that hostname.

## Hardening notes

- Prefer a **dedicated Docker network** shared only by PostgreSQL and postgres-mcp, not every stack on the VM.
- Use Tailscale **grants** to limit which users/devices may reach the VM on 443.
- Pin `recordari/postgres-mcp:<version>` or an image digest.
- Tailscale does not replace MCP bearer authentication.

## Disable Serve

```bash
sudo tailscale serve --https=443 off
```

Stop the MCP container:

```bash
docker stop postgres-mcp
```

See [SECURITY.md](../../SECURITY.md) for the threat model and disclosure process.