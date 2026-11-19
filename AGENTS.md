# Agent Instructions

Instructions for AI agents and developers changing this repository. MCP clients that **use** the server discover tools via the protocol. This file is for agents that **edit** the code.

## Project

`postgres-mcp` is a secure, self-hosted PostgreSQL MCP server built with NestJS (`@nestjs/mcp`). It exposes read-only PostgreSQL tools over Streamable HTTP with YAML-defined security policies.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/config/` | YAML loading, Zod validation, env substitution |
| `src/core/` | `PolicyService` and concurrency primitives (no MCP imports) |
| `src/security/` | Bearer verification, SQL validation, HTTP guards |
| `src/database/` | Pool, introspection, `QueryExecutor` (read-only transactions) |
| `src/mcp/` | MCP tool definitions |
| `test/security/` | Auth and SQL policy regression tests |
| `test/integration/` | Real PostgreSQL + MCP client tests |

## Commands

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run config:validate   # needs CONFIG_PATH, DATABASE_URL, MCP_TOKEN
npm run config:schema     # writes docs/config.schema.json; run after schema changes
npm run config:schema:check
```

Integration tests need PostgreSQL:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/app npm run test:integration
```

Validate a config file without starting the server:

```bash
export CONFIG_PATH=examples/config.minimal.yaml
export DATABASE_URL=postgres://example:example@localhost:5432/app
export MCP_TOKEN="$(openssl rand -hex 32)"
npm run config:validate
```

Example stack smoke test (after `docker compose -f examples/docker-compose.yaml up`):

```bash
export MCP_TOKEN=...   # same value as in compose
bash examples/smoke-test.sh
```

## Non-negotiable security invariants

- **Read-only default.** `security.readonly` must stay `true` in v0.1. Do not add write tools without a major version and full threat review.
- **Fail closed on boot.** Missing config, secrets, or invalid policy must abort startup.
- **Policy before SQL.** Never execute or prepare queries before `SqlValidator` and `PolicyService` checks.
- **Real parser.** Do not replace `pgsql-parser` with regex-only validation for authorization decisions.
- **Database role is primary.** YAML only narrows PostgreSQL privileges; it never grants new ones.
- **Row limits at execution.** `QueryExecutor` uses `DECLARE CURSOR` + `FETCH (maxRows + 1)`, not unbounded `SELECT` with client-side truncation.
- **Conservative view expansion.** `RelationGuard` uses `pg_depend` when enabled; undocumented guarantees about views or functions are forbidden.
- **Secrets.** Never log bearer tokens, `DATABASE_URL`, or query result rows when `logQueries` is false.
- **No silent defaults weakening.** Do not relax startup checks to make demos easier.

## Change requirements

Before finishing a change:

1. Run relevant unit, security, and integration tests.
2. Update `docs/configuration.md` and examples for config contract changes.
3. Add regression tests for new security-sensitive behavior.
4. Keep MCP tool descriptions accurate; agents read them directly.
5. Document breaking changes in README and release notes.

## Source of truth

- [README.md](README.md) — user-facing overview and quick start
- [docs/configuration.md](docs/configuration.md) — YAML contract
- [SECURITY.md](SECURITY.md) — threat model and disclosure
- [examples/](examples/) — supported configuration samples
- `src/config/config.schema.ts` — schema implementation (source of truth)
- `docs/config.schema.json` — generated JSON Schema for editors; keep in sync via `npm run config:schema`

Do not assume undocumented configuration keys exist. Read the schema and loader before using or exposing options.