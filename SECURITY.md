# Security

postgres-mcp is a read-only gateway. Report vulnerabilities privately to the Recordari maintainers before opening a public issue. Please include a query or configuration that demonstrates the problem, and avoid live customer data.

## What v0.1 enforces

- Startup fails closed when the YAML file, database URL, bearer token, or policy is missing or contradictory.
- Bearer tokens are compared by SHA-256 digest with `timingSafeEqual`.
- `Host` and `Origin` are checked by `@nestjs/mcp`. `POST /mcp` requires `application/json`.
- Statements run in a read-only transaction with `statement_timeout`.
- Relation references are taken from the PostgreSQL parser, then view dependencies are resolved from the catalog when `security.introspection.expandViews` is true (the default).

## What you still configure

- A database role without write privileges. The sample is `examples/sql/create_mcp_readonly_role.sql`.
- Network exposure. Bind to `127.0.0.1` or a private Docker network.
- A long random `MCP_TOKEN`. One token is the whole audience in v0.1.

## Known limits

- A view whose underlying tables are not visible in `pg_depend` to this role is not fully expanded. Create views as a role that cannot read secrets, then grant the MCP role `SELECT` on those views only.
- Dynamic SQL inside functions is rejected when the function is not in `pg_catalog`. Ordinary `pg_catalog` functions used by a view are allowed unless they are on the denylist in `src/security/sql.validator.ts`.
- The server does not impersonate several MCP users. Rotate the single bearer token to revoke access.
