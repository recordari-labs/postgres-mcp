# Security

postgres-mcp is a read-only gateway. Report vulnerabilities privately to the Recordari maintainers before opening a public issue. Include a query or configuration that demonstrates the issue. Do not attach live customer data.

## What v0.1 enforces

- Startup fails when the YAML file, required secrets, or policy is missing or contradictory.
- `security.readonly: false` aborts startup. There is no write path in v0.1.
- Bearer tokens are compared with a constant-time digest check.
- MCP HTTP requests: `Host` and `Origin` checks via `@nestjs/mcp`; `POST /mcp` requires `Content-Type: application/json` and a valid bearer token.
- Queries run in `BEGIN READ ONLY` with `statement_timeout` and session `default_transaction_read_only=on`.
- Row caps use a **read-only cursor** and `FETCH (maxRows + 1)` so PostgreSQL does not ship unbounded result sets before truncation.
- SQL is parsed with the real PostgreSQL parser; relation allow/deny is applied before execution.
- When `security.introspection.expandViews` is true (default), views are checked through `pg_depend`. This is conservative validation, not a proof that every view or function is side-effect free.

## Unauthenticated HTTP routes

These endpoints expose **no database data** and accept **no** MCP traffic:

| Route | Response |
| --- | --- |
| `GET /healthz` | `{"status":"ok"}` |
| `GET /logo.png` | PNG project icon |

All tools and `POST /mcp` require bearer authentication.

## What you configure

- A PostgreSQL role limited to `SELECT` on approved relations ([`examples/sql/create_mcp_readonly_role.sql`](examples/sql/create_mcp_readonly_role.sql)).
- Network exposure: bind MCP to `127.0.0.1` or place it behind Tailscale, SSH, or a private reverse proxy.
- A long random `MCP_TOKEN`. One token is the whole audience in v0.1—rotate to revoke.
- `security.http.allowedHosts` must include every hostname clients use (including Tailscale DNS names).

## Known limits

- **Views and functions.** `pg_depend` expansion does not cover every indirect access pattern. Prefer approved views in a dedicated schema, owned by a role that cannot read secrets.
- **SQL surface.** Unparseable or unsupported SQL is rejected. That is intentional.
- **Single tenant.** No per-user MCP tokens in v0.1.

Regression coverage lives in `test/security` and `test/integration`. Passing tests document the guarantees we are willing to claim—not perfect SQL isolation.